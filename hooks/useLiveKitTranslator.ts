import { mintLiveKitToken } from '@/lib/livekit/token';
import { mergeContinuationParagraph, sanitizeTranscriptDisplay, translationForDisplay } from '@/lib/transcriptDisplay';
import {
  AndroidAudioTypePresets,
  AudioSession,
  getDefaultAppleAudioConfigurationForMode,
  type AppleAudioCategoryOption,
  type AppleAudioConfiguration,
  type AudioTrackState,
} from '@livekit/react-native';
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type TextStreamHandler,
} from 'livekit-client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, unstable_batchedUpdates } from 'react-native';

/**
 * LiveKit + Voisa transcript paths:
 * - **`voisa.transcript`** (`RoomEvent.DataReceived`): bilingual `original` / `translated` / `isFinal` from the agent
 *   (Soniox token stream). Primary source for the translate UI.
 * - **`lk.transcription`** (`registerTextStreamHandler`): standard Agents user captions. Dedupe by `lk.segment_id`
 *   and replace interim with final when `lk.transcription_final` is true
 *   (https://docs.livekit.io/agents/multimodality/text/).
 */

export type TranslatorUiConnection =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type FinalTranscriptSegment = {
  id: string;
  original: string;
  translated: string;
  /** Wall-clock start time for merging rapid Soniox finals (client-only). */
  ts?: number;
};

function mapRoomState(state: ConnectionState): TranslatorUiConnection {
  switch (state) {
    case ConnectionState.Connected:
      return 'connected';
    case ConnectionState.Connecting:
      return 'connecting';
    case ConnectionState.Reconnecting:
    case ConnectionState.SignalReconnecting:
      return 'reconnecting';
    case ConnectionState.Disconnected:
      return 'idle';
    default:
      return 'idle';
  }
}

/**
 * On React Native, `room.connect()` may resolve once signaling is up while `ConnectionState` is still
 * `Connecting` (ICE/WebRTC pending). Publishing data too early yields skips and races with migration.
 */
function waitUntilRoomConnected(room: Room, timeoutMs: number): Promise<void> {
  if (room.state === ConnectionState.Connected) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('LiveKit did not reach Connected in time (ICE still settling).'));
    }, timeoutMs);

    const onChange = () => {
      if (room.state === ConnectionState.Connected) {
        cleanup();
        resolve();
      } else if (room.state === ConnectionState.Disconnected) {
        cleanup();
        reject(new Error('LiveKit disconnected before the session reached Connected.'));
      }
    };

    function cleanup() {
      clearTimeout(timer);
      room.off(RoomEvent.ConnectionStateChanged, onChange);
    }

    room.on(RoomEvent.ConnectionStateChanged, onChange);
    onChange();
  });
}

/** Extra headroom vs SDK defaults — reduces premature ICE timeouts during LiveKit Cloud migration (disconnect reason 14 = CONNECTION_TIMEOUT). */
const ROOM_CONNECT_OPTS = {
  autoSubscribe: true,
  peerConnectionTimeout: 45_000,
  websocketTimeout: 45_000,
  maxRetries: 3,
} as const;

const CONNECTED_STATE_WAIT_MS = 45_000;

/**
 * Prefer built‑in loudspeaker vs earpiece when no headset is active.
 * Wired/BT outputs still receive agent audio via normal iOS routing.
 */
function appleAudioPreferSpeaker(
  trackState: AudioTrackState,
  preferSpeakerOutput: boolean,
): AppleAudioConfiguration {
  const base = getDefaultAppleAudioConfigurationForMode(trackState, preferSpeakerOutput);
  if (!preferSpeakerOutput) return base;
  if (trackState !== 'localAndRemote' && trackState !== 'localOnly') {
    return base;
  }
  const merged = new Set<AppleAudioCategoryOption>([
    ...(base.audioCategoryOptions ?? []),
    'defaultToSpeaker',
  ]);
  return {
    ...base,
    audioCategoryOptions: [...merged],
  };
}

async function prepareLiveKitAudioSession(): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

  /** RN WebRTC applies this gain before OS/hardware mixing — keep at 1 so device volume buttons behave normally. */
  await AudioSession.setDefaultRemoteAudioTrackVolume(1);

  if (Platform.OS === 'android') {
    await AudioSession.configureAudio({
      android: {
        preferredOutputList: ['speaker', 'headset', 'bluetooth', 'earpiece'],
        audioTypeOptions: AndroidAudioTypePresets.communication,
      },
    });
  }

  await AudioSession.startAudioSession();

  /**
   * On iOS, `useIOSAudioManagement` derives AVAudioSession from published tracks. Until local mic (+ optional
   * remote agent) tracks exist, trackState is `none` and LiveKit applies **soloAmbient**, which breaks WebRTC
   * microphone capture (no capture indicator / silence). Seed **playAndRecord** before connect; the hook still
   * upgrades routing when remote audio arrives (`localAndRemote`).
   *
   * Do **not** swallow failures here (a prior global patch hid OSStatus errors and left users with no mic).
   * Short retries cover brief contention with other native modules during cold start.
   */
  if (Platform.OS === 'ios') {
    const cfg = appleAudioPreferSpeaker('localOnly', true);
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await AudioSession.setAppleAudioConfiguration(cfg);
        break;
      } catch (e) {
        if (attempt === 3) throw e;
        await new Promise<void>((r) => setTimeout(r, 90 * (attempt + 1)));
      }
    }
  }
}

async function teardownLiveKitAudioSession(): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  try {
    await AudioSession.stopAudioSession();
  } catch {
    /* ignore */
  }
}

const IOS_POST_TEARDOWN_YIELD_MS = 100;

function isOsStatus561017449(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /561017449|OSStatus\s*error\s*561017449/i.test(msg);
}

/** Retries only for transient AVAudioSession category contention — initial seed failures should stay loud. */
async function setAppleAudioConfigurationWith561Retry(cfg: AppleAudioConfiguration): Promise<void> {
  const max = 4;
  let last: unknown;
  for (let i = 0; i < max; i++) {
    try {
      await AudioSession.setAppleAudioConfiguration(cfg);
      return;
    } catch (e) {
      last = e;
      if (!isOsStatus561017449(e) || i === max - 1) throw e;
      await new Promise<void>((r) => setTimeout(r, 80 * (i + 1)));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/**
 * Sliding pause window — finals arriving within this gap from the previous final are merged into the same card,
 * AND live partials arriving within this gap are visually attached to that card (no separate "second frame").
 * Soniox endpointing fires after ~1.2s of silence (`SONIOX_MAX_ENDPOINT_DELAY_MS`); natural mid-thought pauses
 * routinely exceed that. We slide the window forward on every merge so a long continuous monologue stays one
 * thread until the speaker takes a real pause. Tuned long (12s) so brief breath/thinking pauses never split.
 */
const FINAL_MERGE_WINDOW_MS = 12_000;

/** LiveKit Agents stream user captions on this topic (see `ParticipantTranscriptionOutput` in `@livekit/agents`). */
const LK_TRANSCRIPTION_TOPIC = 'lk.transcription';

function appendMergedFinalSegment(
  prev: FinalTranscriptSegment[],
  original: string,
  translated: string,
  now: number,
): FinalTranscriptSegment[] {
  const o = sanitizeTranscriptDisplay(original);
  const t = sanitizeTranscriptDisplay(translated);
  /** Allow finals with source-only when translation arrives late or misses; translation column renders “…”. */
  if (!o && !t) return prev;

  if (prev.length === 0) {
    return [{ id: `${now}-${Math.random().toString(36).slice(2, 10)}`, original: o, translated: t, ts: now }];
  }

  const last = prev[prev.length - 1];
  const lastTs = last.ts ?? now;

  if (now - lastTs > FINAL_MERGE_WINDOW_MS) {
    return [...prev, { id: `${now}-${Math.random().toString(36).slice(2, 10)}`, original: o, translated: t, ts: now }];
  }

  return [
    ...prev.slice(0, -1),
    {
      ...last,
      original: mergeContinuationParagraph(last.original, o),
      translated: mergeContinuationParagraph(last.translated, t),
      /** Slide the pause window forward so continuous speech keeps grouping into this card. */
      ts: now,
    },
  ];
}

export function useLiveKitTranslator() {
  const room = useMemo(
    () =>
      new Room({
        /** Voisa is mic + data + agent audio — disable video-centric paths that add PC/track churn during multi-region failover. */
        adaptiveStream: false,
        dynacast: false,
        singlePeerConnection: true,
        /**
         * Force WebRTC's mic processing pipeline on for every capture: hardware AEC + AGC + noise suppression.
         * Combined with iOS `playAndRecord` + `voiceChat` audio session, this prevents the agent's TTS output
         * (translation playback) from being re-captured by the mic — think VOIP call full-duplex behaviour, the
         * two sides do not clash.
         */
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      }),
    [],
  );

  /** Timers scheduled after connect — cleared on stop/disconnect race. */
  const delayedLangRepublishTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** When the translator agent joins after the mobile client, the first Reliable `publishData` can miss every receiver — republish on remote join until stop. */
  const republishOnRemoteJoinedRef = useRef<(() => void) | null>(null);
  /** While non-null, a translator session is active — used to republish after LiveKit reconnect (waitMs timers alone lose races vs long reconnect / region failover). */
  const activeLanguagePairRef = useRef<{ languageA: string; languageB: string } | null>(null);

  /** `lk.segment_id` → partial/final caption lines (https://docs.livekit.io/agents/multimodality/text/). */
  const lkTranscriptionOrderRef = useRef<string[]>([]);
  const lkTranscriptionMapRef = useRef<Map<string, { partial: string; final?: string }>>(new Map());

  /**
   * Do not use `useIOSAudioManagement` here: it calls `setAppleAudioConfiguration` asynchronously off track-count
   * updates, which can race our explicit iOS prepare/post-mic/reassert path and leave capture stuck.
   * We keep one deterministic owner for AVAudioSession transitions in this hook.
   */

  const [connection, setConnection] = useState<TranslatorUiConnection>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [micLive, setMicLive] = useState(false);
  const [liveOriginal, setLiveOriginal] = useState('');
  const [liveTranslated, setLiveTranslated] = useState('');
  /** Same user speech as surfaced on `lk.transcription` text streams — fallback if `publishData(voisa.transcript)` drops packets. */
  const [liveUserTranscriptLk, setLiveUserTranscriptLk] = useState('');
  const [segments, setSegments] = useState<FinalTranscriptSegment[]>([]);
  const [agentNotice, setAgentNotice] = useState<string | null>(null);

  const flushLkTranscriptionDisplay = useCallback(() => {
    const order = lkTranscriptionOrderRef.current;
    const map = lkTranscriptionMapRef.current;
    const parts: string[] = [];
    for (const id of order) {
      const s = map.get(id);
      if (!s) continue;
      const line = (s.final ?? s.partial).trim();
      if (line) parts.push(line);
    }
    const next = parts.join(' ').trim();
    setLiveUserTranscriptLk((prev) => (prev === next ? prev : next));
  }, []);

  const resetLkTranscriptionState = useCallback(() => {
    lkTranscriptionOrderRef.current = [];
    lkTranscriptionMapRef.current = new Map();
    setLiveUserTranscriptLk('');
  }, []);

  const publishLanguagePair = useCallback(
    async (
      languageA: string,
      languageB: string,
      options?: {
        waitMs?: number;
        translationDomain?: string;
        translationTerms?: { source: string; target: string }[];
      },
    ): Promise<boolean> => {
      const waitBudget = Math.max(0, options?.waitMs ?? 0);
      const start = Date.now();
      while (room.state !== ConnectionState.Connected && Date.now() - start < waitBudget) {
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }
      if (room.state !== ConnectionState.Connected) {
        if (__DEV__ && waitBudget >= 1500) {
          console.warn('[Voisa] publishLanguagePair skipped (room not connected)', room.state);
        }
        return false;
      }
      try {
        const body: Record<string, unknown> = {
          type: 'voisa.language_pair',
          languageA: languageA.trim().toLowerCase(),
          languageB: languageB.trim().toLowerCase(),
        };
        if (options?.translationDomain !== undefined) {
          body.translationDomain = options.translationDomain;
        }
        if (options?.translationTerms !== undefined) {
          body.translationTerms = options.translationTerms;
        }
        const payload = JSON.stringify(body);
        await room.localParticipant.publishData(new TextEncoder().encode(payload), { reliable: true });
        if (activeLanguagePairRef.current) {
          activeLanguagePairRef.current = {
            languageA: languageA.trim().toLowerCase(),
            languageB: languageB.trim().toLowerCase(),
          };
        }
        return true;
      } catch (e) {
        if (__DEV__) {
          console.warn('[Voisa] publishLanguagePair publishData failed', e);
        }
        return false;
      }
    },
    [room],
  );

  /** LiveKit stays Disconnected during token mint; keep UI on “connecting” until connect resolves or stops. */
  const awaitingRoomConnectRef = useRef(false);
  /** Bumps when a newer start/stop invalidates an in-flight start (parallel taps / cancel mid-flight). */
  const connectEpochRef = useRef(0);

  useEffect(() => {
    const handler: TextStreamHandler = (reader, participantInfo) => {
      void (async () => {
        try {
          if (participantInfo.identity !== room.localParticipant.identity) {
            await reader.readAll();
            return;
          }
          const attrs = reader.info.attributes ?? {};
          const segId =
            typeof attrs['lk.segment_id'] === 'string' && attrs['lk.segment_id'].length > 0
              ? attrs['lk.segment_id']
              : reader.info.id;
          const isFinalStream = attrs['lk.transcription_final'] === 'true';

          const map = lkTranscriptionMapRef.current;
          const order = lkTranscriptionOrderRef.current;
          if (!map.has(segId)) {
            map.set(segId, { partial: '' });
            order.push(segId);
          }

          let acc = '';
          for await (const chunk of reader) {
            acc += chunk;
            const entry = map.get(segId)!;
            const t = acc.trim();
            if (isFinalStream) {
              entry.final = t;
              entry.partial = '';
            } else {
              entry.partial = t;
            }
            flushLkTranscriptionDisplay();
          }
          const entry = map.get(segId)!;
          const t = acc.trim();
          if (isFinalStream) {
            entry.final = t;
            entry.partial = '';
          } else {
            entry.partial = t;
          }
          flushLkTranscriptionDisplay();
        } catch {
          /* malformed or interrupted stream — ignore */
        }
      })();
    };

    try {
      room.registerTextStreamHandler(LK_TRANSCRIPTION_TOPIC, handler);
    } catch {
      /** Only one handler per topic — dev fast refresh / leak would throw `HandlerAlreadyRegistered`. */
    }

    const onDisconnected = () => resetLkTranscriptionState();
    room.on(RoomEvent.Disconnected, onDisconnected);

    return () => {
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.unregisterTextStreamHandler(LK_TRANSCRIPTION_TOPIC);
    };
  }, [flushLkTranscriptionDisplay, resetLkTranscriptionState, room]);

  useEffect(() => {
    let prevConnectionState = room.state;

    const onConnChange = () => {
      const nextState = room.state;
      const mapped = mapRoomState(nextState);
      if (awaitingRoomConnectRef.current && mapped === 'idle') {
        setConnection('connecting');
        prevConnectionState = nextState;
        return;
      }
      setConnection(mapped);

      if (
        prevConnectionState !== ConnectionState.Connected &&
        nextState === ConnectionState.Connected &&
        activeLanguagePairRef.current
      ) {
        const pair = activeLanguagePairRef.current;
        void publishLanguagePair(pair.languageA, pair.languageB, { waitMs: 15_000 });
      }
      prevConnectionState = nextState;
    };

    function normalizeDataPayload(payload: unknown): Uint8Array {
      if (payload instanceof Uint8Array) return payload;
      if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
      if (
        payload !== null &&
        typeof payload === 'object' &&
        'byteLength' in payload &&
        typeof (payload as ArrayBufferView).byteLength === 'number'
      ) {
        const v = payload as ArrayBufferView;
        return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      }
      return new Uint8Array();
    }

    const onData = (payload: unknown) => {
      let decoded = '';
      try {
        const bytes = normalizeDataPayload(payload);
        if (bytes.byteLength === 0) return;
        decoded = new TextDecoder().decode(bytes);
        const msg = JSON.parse(decoded) as {
          type?: string;
          original?: string;
          translated?: string;
          isFinal?: boolean;
          message?: string;
          level?: string;
        };
        if (msg.type === 'voisa.agent_status' && typeof msg.message === 'string') {
          setAgentNotice(msg.message);
          return;
        }
        if (msg.type !== 'voisa.transcript') return;

        const original = sanitizeTranscriptDisplay(msg.original ?? '');
        const translated = translationForDisplay(original, sanitizeTranscriptDisplay(msg.translated ?? ''));

        if (msg.isFinal && (original.length > 0 || translated.length > 0)) {
          const now = Date.now();
          /**
           * Clear live card immediately on final commit — otherwise the new segment AND the live card
           * render the same text for the hold window, looking like two frames for one utterance.
           */
          unstable_batchedUpdates(() => {
            setSegments((prev) => appendMergedFinalSegment(prev, original, translated, now));
            setLiveOriginal('');
            setLiveTranslated('');
            resetLkTranscriptionState();
          });
          return;
        }

        unstable_batchedUpdates(() => {
          setLiveOriginal(original);
          setLiveTranslated(translated);
        });
      } catch (e) {
        if (__DEV__ && decoded.length > 0) {
          console.warn('[Voisa] DataReceived JSON parse failed', e, decoded.slice(0, 240));
        }
      }
    };

    setConnection(mapRoomState(room.state));
    room.on(RoomEvent.ConnectionStateChanged, onConnChange);
    room.on(RoomEvent.DataReceived, onData);

    return () => {
      room.off(RoomEvent.ConnectionStateChanged, onConnChange);
      room.off(RoomEvent.DataReceived, onData);
      if (republishOnRemoteJoinedRef.current) {
        room.off(RoomEvent.ParticipantConnected, republishOnRemoteJoinedRef.current);
        republishOnRemoteJoinedRef.current = null;
      }
      delayedLangRepublishTimersRef.current.forEach(clearTimeout);
      delayedLangRepublishTimersRef.current = [];
      activeLanguagePairRef.current = null;
      room.disconnect();
      void teardownLiveKitAudioSession();
    };
  }, [publishLanguagePair, resetLkTranscriptionState, room]);

  useEffect(() => {
    const onLocalPublished = (publication: { kind: Track.Kind }) => {
      if (publication.kind === Track.Kind.Audio) setMicLive(true);
    };
    const onLocalUnpublished = (publication: { kind: Track.Kind }) => {
      if (publication.kind === Track.Kind.Audio) setMicLive(false);
    };
    const onDisconnected = () => setMicLive(false);

    room.on(RoomEvent.LocalTrackPublished, onLocalPublished);
    room.on(RoomEvent.LocalTrackUnpublished, onLocalUnpublished);
    room.on(RoomEvent.Disconnected, onDisconnected);
    return () => {
      room.off(RoomEvent.LocalTrackPublished, onLocalPublished);
      room.off(RoomEvent.LocalTrackUnpublished, onLocalUnpublished);
      room.off(RoomEvent.Disconnected, onDisconnected);
    };
  }, [room]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    let debounce: ReturnType<typeof setTimeout> | null = null;

    const scheduleLocalAndRemote = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        if (!room.localParticipant.isMicrophoneEnabled) return;
        let hasRemoteAudio = false;
        for (const p of room.remoteParticipants.values()) {
          for (const pub of p.trackPublications.values()) {
            if (pub.kind === Track.Kind.Audio && pub.track) {
              hasRemoteAudio = true;
              break;
            }
          }
          if (hasRemoteAudio) break;
        }
        if (!hasRemoteAudio) return;
        void setAppleAudioConfigurationWith561Retry(appleAudioPreferSpeaker('localAndRemote', true)).catch(
          (e) => {
            if (__DEV__) console.warn('[Voisa] iOS localAndRemote reassert failed', e);
          },
        );
      }, 140);
    };

    const onTrackPublished = (publication: { kind: Track.Kind }, participant: { isLocal: boolean }) => {
      if (participant.isLocal) return;
      if (publication.kind === Track.Kind.Audio) scheduleLocalAndRemote();
    };

    const onParticipantConnected = (participant: { isLocal: boolean }) => {
      if (participant.isLocal) return;
      scheduleLocalAndRemote();
    };

    room.on(RoomEvent.TrackSubscribed, scheduleLocalAndRemote);
    room.on(RoomEvent.TrackPublished, onTrackPublished);
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    return () => {
      room.off(RoomEvent.TrackSubscribed, scheduleLocalAndRemote);
      room.off(RoomEvent.TrackPublished, onTrackPublished);
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      if (debounce) clearTimeout(debounce);
    };
  }, [room]);

  const startSession = useCallback(
    async (opts: {
      roomName: string;
      participantName: string;
      languageA: string;
      languageB: string;
    }) => {
      setLastError(null);
      setAgentNotice(null);
      setMicLive(false);

      connectEpochRef.current += 1;
      const epoch = connectEpochRef.current;
      awaitingRoomConnectRef.current = true;
      activeLanguagePairRef.current = null;
      setConnection('connecting');

      /** Avoid stale signal/WebSocket from a prior session racing server ping timeouts (WARN in Metro). */
      if (room.state !== ConnectionState.Disconnected) {
        try {
          await room.localParticipant.setMicrophoneEnabled(false);
        } catch {
          /* ignore */
        }
        try {
          await room.disconnect();
        } catch {
          /* ignore */
        }
        await teardownLiveKitAudioSession();
      }

      try {
        const { token, url } = await mintLiveKitToken(opts.roomName, opts.participantName);
        if (epoch !== connectEpochRef.current) return;

        await room.prepareConnection(url, token);
        if (epoch !== connectEpochRef.current) return;

        await prepareLiveKitAudioSession();
        if (epoch !== connectEpochRef.current) {
          await teardownLiveKitAudioSession();
          return;
        }

        await room.connect(url, token, ROOM_CONNECT_OPTS);
        if (epoch !== connectEpochRef.current) {
          await room.disconnect();
          await teardownLiveKitAudioSession();
          return;
        }

        await waitUntilRoomConnected(room, CONNECTED_STATE_WAIT_MS);
        if (epoch !== connectEpochRef.current) {
          await room.disconnect();
          await teardownLiveKitAudioSession();
          return;
        }

        await room.localParticipant.setMicrophoneEnabled(true);

        if (Platform.OS === 'ios') {
          /**
           * A short yield helps the recording indicator / capture path settle before we re-seed speaker routing.
           */
          await new Promise<void>((r) => setTimeout(r, 120));
          await setAppleAudioConfigurationWith561Retry(appleAudioPreferSpeaker('localOnly', true));
          let hasRemoteAudio = false;
          for (const p of room.remoteParticipants.values()) {
            for (const pub of p.trackPublications.values()) {
              if (pub.kind === Track.Kind.Audio && pub.track) {
                hasRemoteAudio = true;
                break;
              }
            }
            if (hasRemoteAudio) break;
          }
          if (hasRemoteAudio) {
            await setAppleAudioConfigurationWith561Retry(appleAudioPreferSpeaker('localAndRemote', true));
          }
        }

        try {
          await room.startAudio();
        } catch {
          /* Browser-oriented playback unlock — safe to ignore on RN when no remote elements yet */
        }

        activeLanguagePairRef.current = { languageA: opts.languageA, languageB: opts.languageB };

        delayedLangRepublishTimersRef.current.forEach(clearTimeout);
        delayedLangRepublishTimersRef.current = [];

        if (republishOnRemoteJoinedRef.current) {
          room.off(RoomEvent.ParticipantConnected, republishOnRemoteJoinedRef.current);
          republishOnRemoteJoinedRef.current = null;
        }

        const pushRepublishSoon = async () =>
          publishLanguagePair(opts.languageA, opts.languageB, { waitMs: 12_000 });

        await publishLanguagePair(opts.languageA, opts.languageB, { waitMs: 800 });

        const onRemoteJoined = () => {
          void pushRepublishSoon();
        };
        republishOnRemoteJoinedRef.current = onRemoteJoined;
        room.on(RoomEvent.ParticipantConnected, onRemoteJoined);

        const t900 = setTimeout(() => void pushRepublishSoon(), 900);
        const t2200 = setTimeout(() => void pushRepublishSoon(), 2200);
        delayedLangRepublishTimersRef.current = [t900, t2200];

      } catch (e) {
        setMicLive(false);
        activeLanguagePairRef.current = null;
        delayedLangRepublishTimersRef.current.forEach(clearTimeout);
        delayedLangRepublishTimersRef.current = [];
        if (republishOnRemoteJoinedRef.current) {
          room.off(RoomEvent.ParticipantConnected, republishOnRemoteJoinedRef.current);
          republishOnRemoteJoinedRef.current = null;
        }
        try {
          await room.disconnect();
        } catch {
          /* ignore */
        }
        await teardownLiveKitAudioSession();

        if (epoch !== connectEpochRef.current) {
          setConnection('idle');
          return;
        }

        const msg = e instanceof Error ? e.message : String(e);
        setLastError(msg);
        setConnection('error');
        throw e;
      } finally {
        /** Superseded attempts must not clear `awaiting` — a newer `startSession` owns the flag. */
        if (epoch === connectEpochRef.current) {
          awaitingRoomConnectRef.current = false;
        }
      }
    },
    [publishLanguagePair, room],
  );

  const stopSession = useCallback(async () => {
    activeLanguagePairRef.current = null;
    delayedLangRepublishTimersRef.current.forEach(clearTimeout);
    delayedLangRepublishTimersRef.current = [];
    if (republishOnRemoteJoinedRef.current) {
      room.off(RoomEvent.ParticipantConnected, republishOnRemoteJoinedRef.current);
      republishOnRemoteJoinedRef.current = null;
    }

    connectEpochRef.current += 1;
    awaitingRoomConnectRef.current = false;
    setMicLive(false);
    await room.localParticipant.setMicrophoneEnabled(false);
    await room.disconnect();
    await teardownLiveKitAudioSession();
    if (Platform.OS === 'ios') {
      await new Promise<void>((r) => setTimeout(r, IOS_POST_TEARDOWN_YIELD_MS));
    }
    setLiveOriginal('');
    setLiveTranslated('');
    resetLkTranscriptionState();
    setAgentNotice(null);
    setConnection('idle');
  }, [resetLkTranscriptionState, room]);

  /**
   * Id of the segment the current live partial should visually attach to (one growing card per "thread").
   * Null when the live partial is the start of a new thread (no segments yet, or last segment is older than
   * the merge window — i.e. user really paused/stopped). This is purely derived; the source of truth is
   * `segments[last].ts` vs `Date.now()`. We re-render every 500 ms while live text is present so the
   * boundary flips accurately when the user actually pauses past `FINAL_MERGE_WINDOW_MS`.
   */
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const hasLive = liveOriginal.length > 0 || liveTranslated.length > 0;
    if (!hasLive) return;
    const id = setInterval(() => setNowTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [liveOriginal, liveTranslated]);
  const liveContinuationSegmentId = useMemo(() => {
    if (liveOriginal.length === 0 && liveTranslated.length === 0) return null;
    if (segments.length === 0) return null;
    const last = segments[segments.length - 1];
    const lastTs = last.ts ?? 0;
    if (Date.now() - lastTs > FINAL_MERGE_WINDOW_MS) return null;
    return last.id;
    // nowTick intentionally drives recomputation across the pause boundary
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveOriginal, liveTranslated, segments, nowTick]);

  return {
    room,
    connection,
    lastError,
    micLive,
    liveOriginal,
    liveTranslated,
    liveUserTranscriptLk,
    segments,
    liveContinuationSegmentId,
    agentNotice,
    publishLanguagePair,
    startSession,
    stopSession,
    clearSegments: () => setSegments([]),
  };
}
