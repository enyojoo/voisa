import {
  AudioByteStream,
  DEFAULT_API_CONNECT_OPTIONS,
  log,
  normalizeLanguage,
  shortuuid,
  tts,
  type APIConnectOptions,
} from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import WebSocket from 'ws';

import { defaultSonioxVoiceForLanguage } from './soniox_tts_voice_defaults.js';
import {
  defaultSonioxTtsWebSocketUrl,
  parseSonioxRegion,
  sonioxTtsRegionHostnameMismatch,
} from './soniox_region.js';

function base639One(code: string): string {
  return code.split('-')[0]!.trim().toLowerCase();
}

/**
 * Soniox realtime TTS — WebSocket protocol overview:
 * https://soniox.com/docs/tts/rt/real-time-generation
 *
 * Multiple multiplexed streams per socket (`stream_id`), core rules & limits:
 * https://soniox.com/docs/tts/rt/streams (max **5** concurrent streams per connection).
 *
 * Stream lifecycle (`text_end` → `audio_end` → `terminated`; cancel; errors):
 * https://soniox.com/docs/tts/rt/termination
 *
 * Idle connection keepalive (`keep_alive`, ~20–30s):
 * https://soniox.com/docs/tts/rt/connection-keepalive
 *
 * Account limits (RPM, concurrent sockets, streams/socket, stream duration):
 * https://soniox.com/docs/tts/rt/limits-and-quotas
 *
 * Full message schema:
 * https://soniox.com/docs/api-reference/tts/websocket-api
 *
 * Regional TTS host defaults with `SONIOX_REGION` — https://soniox.com/docs/data-residency#regional-endpoints
 */
const SONIOX_TTS_MAX_STREAMS_PER_SOCKET = 5;

type SonioxTtsInbound = {
  stream_id?: string;
  audio?: string;
  audio_end?: boolean;
  terminated?: boolean;
  error_code?: number;
  error_message?: string;
};

type ResolvedSonioxTtsOpts = {
  apiKey: string;
  baseUrl: string;
  model: string;
  voice: string;
  audioFormat: string;
  sampleRate: number;
  bitrate?: number;
};

function envTrim(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v && v.length > 0 ? v : undefined;
}

function parsePositiveInt(key: string): number | undefined {
  const raw = envTrim(key);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

function sonioxTtsKeepaliveIntervalMs(): number {
  return parsePositiveInt('SONIOX_TTS_KEEPALIVE_INTERVAL_MS') ?? 25_000;
}

async function wsOpened(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) return;
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
    ws.once('close', () => reject(new Error('Soniox TTS websocket closed before open')));
  });
}

function muxRegistryKey(apiKey: string, baseUrl: string): string {
  return `${baseUrl}\n${apiKey}`;
}

/**
 * One Soniox TTS websocket shared by concurrent LiveKit synthesize streams (same API key + URL).
 * Inbound JSON is routed by `stream_id` per https://soniox.com/docs/tts/rt/streams — streams stay isolated.
 */
class SonioxTtsMux {
  readonly #baseUrl: string;

  #ws: WebSocket | null = null;
  #connecting: Promise<void> | null = null;

  /** Whole-connection idle ping — https://soniox.com/docs/tts/rt/connection-keepalive */
  #keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  /** stream_id → inbound handler */
  #handlers = new Map<string, (res: SonioxTtsInbound) => void>();

  /** Wake blocked {@link SonioxRealtimeSynthesizeStream} waits when the mux socket closes unexpectedly */
  #closeListeners = new Set<() => void>();

  constructor(baseUrl: string) {
    this.#baseUrl = baseUrl;
  }

  addCloseListener(fn: () => void): () => void {
    this.#closeListeners.add(fn);
    return () => {
      this.#closeListeners.delete(fn);
    };
  }

  #emitCloseListeners(): void {
    for (const fn of this.#closeListeners) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
  }

  #stopKeepalive(): void {
    if (this.#keepaliveTimer) {
      clearInterval(this.#keepaliveTimer);
      this.#keepaliveTimer = null;
    }
  }

  /** Ping shared socket on an interval so Soniox does not close it during idle gaps between streams / turns. */
  #startKeepalive(): void {
    this.#stopKeepalive();
    const intervalMs = sonioxTtsKeepaliveIntervalMs();
    this.#keepaliveTimer = setInterval(() => {
      const w = this.#ws;
      if (!w || w.readyState !== WebSocket.OPEN) return;
      try {
        w.send(JSON.stringify({ keep_alive: true }));
      } catch {
        /* ignore */
      }
    }, intervalMs);
  }

  async ensureOpen(): Promise<void> {
    if (this.#ws?.readyState === WebSocket.OPEN) return;
    if (!this.#connecting) {
      this.#connecting = this.#openSocket().finally(() => {
        this.#connecting = null;
      });
    }
    await this.#connecting;
  }

  async #openSocket(): Promise<void> {
    const ws = new WebSocket(this.#baseUrl);
    await wsOpened(ws);

    ws.on('message', (raw) => this.#dispatch(raw));
    ws.on('error', (err) => {
      log().error({ err }, 'Soniox TTS mux WebSocket error');
    });
    ws.on('close', () => {
      this.#stopKeepalive();
      this.#ws = null;
      this.#handlers.clear();
      this.#emitCloseListeners();
    });

    this.#ws = ws;
    this.#startKeepalive();
  }

  #dispatch(raw: WebSocket.RawData): void {
    let res: SonioxTtsInbound;
    try {
      res = JSON.parse(Buffer.isBuffer(raw) ? raw.toString() : String(raw)) as SonioxTtsInbound;
    } catch (err) {
      log().warn({ err }, 'Soniox TTS mux: skip non-JSON websocket message');
      return;
    }

    const sid = res.stream_id;

    if (res.error_code !== undefined) {
      if (sid && this.#handlers.has(sid)) {
        this.#handlers.get(sid)!(res);
      } else {
        const msg = String(res.error_message ?? '');
        const isLateMissingStream = res.error_code === 400 && /stream .* not found/i.test(msg);
        if (!isLateMissingStream) {
          log().warn(
            { sonioxErrorCode: res.error_code, sonioxErrorMessage: res.error_message },
            'Soniox TTS mux: message-level error without active stream handler',
          );
        }
      }
      return;
    }

    if (sid && this.#handlers.has(sid)) {
      this.#handlers.get(sid)!(res);
    }
  }

  registerStream(streamId: string, handler: (res: SonioxTtsInbound) => void): void {
    if (this.#handlers.has(streamId)) {
      throw new Error(`Soniox TTS mux: duplicate stream_id ${streamId}`);
    }
    if (this.#handlers.size >= SONIOX_TTS_MAX_STREAMS_PER_SOCKET) {
      throw new Error(
        `Soniox TTS: exceeded ${SONIOX_TTS_MAX_STREAMS_PER_SOCKET} concurrent streams per websocket — see https://soniox.com/docs/tts/rt/streams`,
      );
    }
    this.#handlers.set(streamId, handler);
  }

  unregisterStream(streamId: string): void {
    this.#handlers.delete(streamId);
  }

  send(payload: Record<string, unknown>): void {
    const ws = this.#ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('Soniox TTS mux: websocket not connected');
    }
    /** Single JSON stringify — callers must pass plain objects (not `JSON.stringify` output). */
    ws.send(JSON.stringify(payload));
  }

  shutdown(): void {
    this.#stopKeepalive();
    try {
      this.#ws?.close();
    } catch {
      /* ignore */
    }
  }
}

type MuxLease = {
  mux: SonioxTtsMux;
  release: () => void;
};

const muxRegistry = new Map<string, { mux: SonioxTtsMux; refCount: number }>();

function acquireMuxLease(apiKey: string, baseUrl: string): MuxLease {
  const key = muxRegistryKey(apiKey, baseUrl);
  let entry = muxRegistry.get(key);
  if (!entry) {
    entry = { mux: new SonioxTtsMux(baseUrl), refCount: 0 };
    muxRegistry.set(key, entry);
  }
  entry.refCount++;

  let released = false;
  return {
    mux: entry.mux,
    release: () => {
      if (released) return;
      released = true;
      entry!.refCount--;
      if (entry!.refCount <= 0) {
        entry!.mux.shutdown();
        muxRegistry.delete(key);
      }
    },
  };
}

export class SonioxRealtimeTTS extends tts.TTS {
  readonly label = 'soniox.realtime.TTS';

  #opts: ResolvedSonioxTtsOpts;
  #language: string;
  #voicePinnedByEnv: boolean;

  constructor(opts?: Partial<ResolvedSonioxTtsOpts> & { language?: string }) {
    const apiKey = opts?.apiKey ?? envTrim('SONIOX_API_KEY');
    if (!apiKey) {
      throw new Error('SonioxRealtimeTTS requires SONIOX_API_KEY (or opts.apiKey)');
    }

    const sampleRate = opts?.sampleRate ?? parsePositiveInt('SONIOX_TTS_SAMPLE_RATE') ?? 24000;

    super(sampleRate, 1, { streaming: true });

    const bitrate = opts?.bitrate ?? parsePositiveInt('SONIOX_TTS_BITRATE');

    const langRaw =
      opts?.language ?? envTrim('SONIOX_TTS_LANGUAGE') ?? envTrim('TRANSLATION_LANGUAGE_B') ?? 'en';
    const langNorm = normalizeLanguage(langRaw);

    const optsVoice =
      opts && typeof opts.voice === 'string' && opts.voice.trim().length > 0
        ? opts.voice.trim()
        : undefined;
    const envVoice = envTrim('SONIOX_TTS_VOICE');
    this.#voicePinnedByEnv = !!optsVoice || !!envVoice;
    const voiceResolved =
      optsVoice ??
      envVoice ??
      defaultSonioxVoiceForLanguage(base639One(langNorm));

    const region = parseSonioxRegion();
    const explicitTtsUrl = opts?.baseUrl ?? envTrim('SONIOX_TTS_WS_URL');
    const baseUrl =
      explicitTtsUrl && explicitTtsUrl.length > 0 ? explicitTtsUrl : defaultSonioxTtsWebSocketUrl(region);

    if (
      explicitTtsUrl &&
      explicitTtsUrl.length > 0 &&
      process.env.SONIOX_REGION?.trim() &&
      sonioxTtsRegionHostnameMismatch(region, baseUrl)
    ) {
      log().warn(
        { region, baseUrl },
        'SONIOX_TTS_WS_URL hostname may not match SONIOX_REGION — check https://soniox.com/docs/data-residency',
      );
    }

    this.#opts = {
      apiKey,
      baseUrl,
      model: opts?.model ?? envTrim('SONIOX_TTS_MODEL') ?? 'tts-rt-v1',
      voice: voiceResolved,
      audioFormat: opts?.audioFormat ?? envTrim('SONIOX_TTS_AUDIO_FORMAT') ?? 'pcm_s16le',
      sampleRate,
      ...(bitrate !== undefined ? { bitrate } : {}),
    };

    this.#language = langNorm;
  }

  override get model(): string {
    return this.#opts.model;
  }

  override get provider(): string {
    return 'soniox';
  }

  /** Target spoken language for synthesized text (typically translation output / `languageB`). */
  setLanguage(code: string): void {
    const t = code.trim();
    if (!t) return;
    const normalized = normalizeLanguage(t);
    this.#language = normalized;
    if (!this.#voicePinnedByEnv) {
      this.#opts.voice = defaultSonioxVoiceForLanguage(base639One(normalized));
    }
  }

  /** Language passed on each new Soniox stream config (updated live via {@link setLanguage}). */
  get synthesizeLanguage(): string {
    return this.#language;
  }

  synthesize(): tts.ChunkedStream {
    throw new Error('SonioxRealtimeTTS does not implement chunked synthesize(); streaming uses stream()');
  }

  stream(options?: { connOptions?: APIConnectOptions }): SonioxRealtimeSynthesizeStream {
    const connOptions = options?.connOptions ?? DEFAULT_API_CONNECT_OPTIONS;
    return new SonioxRealtimeSynthesizeStream(this, this.#opts, connOptions);
  }
}

class SonioxRealtimeSynthesizeStream extends tts.SynthesizeStream {
  readonly label = 'soniox.realtime.SynthesizeStream';

  #voisa: SonioxRealtimeTTS;
  #ttsOpts: ResolvedSonioxTtsOpts;

  constructor(voisa: SonioxRealtimeTTS, opts: ResolvedSonioxTtsOpts, connOptions: APIConnectOptions) {
    super(voisa, connOptions);
    this.#voisa = voisa;
    this.#ttsOpts = opts;
  }

  protected async run(): Promise<void> {
    const lease = acquireMuxLease(this.#ttsOpts.apiKey, this.#ttsOpts.baseUrl);
    const { mux } = lease;

    const terminators = new Map<string, () => void>();

    const waitTerminated = (streamId: string): Promise<void> =>
      new Promise<void>((resolve) => {
        terminators.set(streamId, resolve);
      });

    const resolveTerminated = (streamId: string | undefined) => {
      if (!streamId) return;
      const cb = terminators.get(streamId);
      if (!cb) return;
      terminators.delete(streamId);
      cb();
    };

    const releaseAllTerminated = () => {
      for (const cb of terminators.values()) {
        cb();
      }
      terminators.clear();
    };

    const removeMuxCloseListener = mux.addCloseListener(releaseAllTerminated);

    await mux.ensureOpen();

    const bstream = new AudioByteStream(this.#ttsOpts.sampleRate, 1);
    const requestId = shortuuid('tts_request_');

    let lastFrame: AudioFrame | undefined;

    const sendLastFrame = (segmentId: string | undefined, final: boolean) => {
      if (!lastFrame || !segmentId) return;
      this.queue.put({
        requestId,
        segmentId,
        frame: lastFrame,
        final,
      });
      lastFrame = undefined;
    };

    let recvFailed: Error | undefined;

    try {
      let activeStreamId: string | undefined;

      const configPayload = (streamId: string) => ({
        api_key: this.#ttsOpts.apiKey,
        stream_id: streamId,
        model: this.#ttsOpts.model,
        language: this.#voisa.synthesizeLanguage,
        voice: this.#ttsOpts.voice,
        audio_format: this.#ttsOpts.audioFormat,
        sample_rate: this.#ttsOpts.sampleRate,
        ...(this.#ttsOpts.bitrate !== undefined ? { bitrate: this.#ttsOpts.bitrate } : {}),
      });

      const inboundForSegment = (sid: string) => (res: SonioxTtsInbound) => {
        if (res.stream_id !== undefined && res.stream_id !== sid) return;

        if (res.error_code !== undefined) {
          const msg = `Soniox TTS error ${res.error_code}: ${res.error_message ?? ''}`;
          log().error(
            { sonioxErrorCode: res.error_code, sonioxErrorMessage: res.error_message, stream_id: sid },
            msg,
          );
          /** Stream-scoped failure — Soniox sends `terminated` next; finish in that branch. https://soniox.com/docs/tts/rt/streams#error-isolation */
          recvFailed = new Error(msg);
          return;
        }

        if (res.audio) {
          const buf = Buffer.from(res.audio, 'base64');
          const view = new Int8Array(buf);
          for (const frame of bstream.write(view.buffer)) {
            sendLastFrame(sid, false);
            lastFrame = frame;
          }
        }

        if (res.audio_end) {
          for (const frame of bstream.flush()) {
            sendLastFrame(sid, false);
            lastFrame = frame;
          }
          sendLastFrame(sid, true);
        }

        if (res.terminated) {
          mux.unregisterStream(sid);
          resolveTerminated(sid);
        }
      };

      /** Normal completion: `text_end` → server `audio_end` → `terminated` — https://soniox.com/docs/tts/rt/termination */
      const endSegment = async () => {
        if (!activeStreamId) return;
        const sid = activeStreamId;
        const done = waitTerminated(sid);
        try {
          mux.send({ text: '', text_end: true, stream_id: sid });
        } catch (e) {
          terminators.delete(sid);
          mux.unregisterStream(sid);
          throw e instanceof Error ? e : new Error(String(e));
        }
        await done;
        mux.unregisterStream(sid);
        activeStreamId = undefined;
        if (recvFailed) throw recvFailed;
      };

      const ensureSegment = async () => {
        if (activeStreamId) return;
        const sid = shortuuid('soniox_tts_');
        mux.registerStream(sid, inboundForSegment(sid));
        mux.send(configPayload(sid));
        activeStreamId = sid;
      };

      /** Client cancel — https://soniox.com/docs/tts/rt/termination#client-initiated-cancellation */
      const onSynthAbort = () => {
        const sid = activeStreamId;
        if (!sid) return;
        try {
          mux.send({ stream_id: sid, cancel: true });
        } catch {
          /* ignore */
        }
      };
      this.abortSignal.addEventListener('abort', onSynthAbort);

      try {
        for await (const data of this.input) {
          if (this.abortSignal.aborted) break;

          if (data === tts.SynthesizeStream.FLUSH_SENTINEL) {
            await endSegment();
            continue;
          }

          if (typeof data === 'string' && data.length > 0) {
            await ensureSegment();
            mux.send({
              text: data,
              text_end: false,
              stream_id: activeStreamId,
            });
          }
        }

        await endSegment();
        this.queue.put(tts.SynthesizeStream.END_OF_STREAM);
      } finally {
        this.abortSignal.removeEventListener('abort', onSynthAbort);
        if (activeStreamId) {
          mux.unregisterStream(activeStreamId);
          activeStreamId = undefined;
        }
      }
    } catch (e) {
      if (this.abortSignal.aborted) return;
      throw recvFailed ?? (e instanceof Error ? e : new Error(String(e)));
    } finally {
      removeMuxCloseListener();
      releaseAllTerminated();
      lease.release();
    }
  }
}
