import {
  cli,
  defineAgent,
  inference,
  log,
  metrics,
  normalizeLanguage,
  ServerOptions,
  voice,
  type JobContext,
} from '@livekit/agents';
import { RoomEvent } from '@livekit/rtc-node';
import * as silero from '@livekit/agents-plugin-silero';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

import { PassthroughTranslationLLM } from './passthrough_llm.js';
import { SonioxRealtimeTTS } from './soniox_tts.js';
import { SonioxTranslationSTT, type VoisaTranscriptBridgePayload } from './soniox_stt.js';
import { VoisaInterpretationCoordinator } from './voisa_interpretation_coordinator.js';

dotenv.config({ path: '.env.local' });

interface ProcessUserData {
  vad: silero.VAD;
}

function parsePositiveInt(raw: string | undefined, fallback: number, max = 30): number {
  const n = raw !== undefined ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Transient ICE / SFU churn often surfaces as `wait_pc_connection timed out` from rtc-node FFI. */
function isRetriableLiveKitConnectError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /wait_pc_connection/i.test(msg) ||
    /peer\s*connection.*timed?\s*out/i.test(msg) ||
    /engine:\s*connection error/i.test(msg)
  );
}

/**
 * {@link JobContext.connect} uses rtc-node defaults (`join_retries: 1`). Slow joins / region failover can
 * fail once spuriously — bounded backoff retries recover without redeploying elsewhere.
 */
async function connectAgentWithRetries(ctx: JobContext<ProcessUserData>, lkLogger: ReturnType<typeof log>): Promise<void> {
  const attempts = parsePositiveInt(process.env.LIVEKIT_AGENT_CONNECT_ATTEMPTS, 4);
  const baseDelayMs = parsePositiveInt(process.env.LIVEKIT_AGENT_CONNECT_BASE_DELAY_MS, 750);

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await ctx.connect();
      return;
    } catch (err) {
      lastErr = err;
      const willRetry = i < attempts - 1 && isRetriableLiveKitConnectError(err);
      lkLogger.warn({ err, attempt: i + 1, attempts, willRetry }, 'LiveKit ctx.connect failed');
      try {
        await ctx.room.disconnect();
      } catch {
        /* ignore */
      }
      if (!willRetry) break;
      const delayMs = baseDelayMs * 2 ** i + Math.floor(Math.random() * 400);
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

function decodeVoisaJson(bytes: Uint8Array): Record<string, unknown> | null {
  try {
    const raw = new TextDecoder().decode(bytes);
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseEnvBool(key: string, defaultVal: boolean): boolean {
  const v = process.env[key]?.trim().toLowerCase();
  if (!v) return defaultVal;
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return defaultVal;
}

export default defineAgent<ProcessUserData>({
  prewarm: async (proc) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx) => {
    const logger = log();
    const userData = ctx.proc.userData;

    /**
     * Join the room **before** AgentSession / Soniox / TTS setup. LiveKit arms a 10s watchdog when the job
     * entry runs (`job_proc_lazy_main.ts`): `ctx.connect()` must flip `connected` soon or you get
     * “room not connect after job_entry…” and the mobile client races an empty room while rtc-node is busy.
     *
     * @see https://docs.livekit.io/agents/build/session/#connecting — connect as early as possible.
     */
    await connectAgentWithRetries(ctx, logger);

    const publishVoisaJson = (payload: Record<string, unknown>, opts?: { reliable?: boolean }) => {
      try {
        const lp = ctx.room.localParticipant;
        if (!lp) return;
        const data = new TextEncoder().encode(JSON.stringify(payload));
        /** Interims lossy/low-latency so UI tracks TTS/audio; finals stay ordered for segment commits. */
        void lp.publishData(data, { reliable: opts?.reliable ?? true });
      } catch (e) {
        logger.warn({ err: e }, 'publishData(voisa.*) failed');
      }
    };

    let interpretation: VoisaInterpretationCoordinator | undefined;

    const publishTranscript = (payload: VoisaTranscriptBridgePayload) => {
      publishVoisaJson(payload, { reliable: payload.isFinal });
      interpretation?.onTranscript(payload);
    };

    const translationStt = new SonioxTranslationSTT({
      onBridge: publishTranscript,
      onFatal: (message) => {
        publishVoisaJson({ type: 'voisa.agent_status', level: 'error', message });
      },
    });

    const ttsProvider = (process.env.VOISA_TTS_PROVIDER ?? 'soniox').toLowerCase();
    const bootstrapLangB = (process.env.TRANSLATION_LANGUAGE_B ?? 'en').trim();

    const inferenceTts =
      ttsProvider === 'livekit'
        ? new inference.TTS({
            model: 'cartesia/sonic-3',
            voice:
              process.env.INFERENCE_TTS_VOICE?.trim() ??
              process.env.LIVEKIT_TTS_VOICE?.trim() ??
              '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
            language: normalizeLanguage(bootstrapLangB),
          })
        : undefined;
    const sonioxTts = ttsProvider === 'livekit' ? undefined : new SonioxRealtimeTTS();
    const sessionTts = sonioxTts ?? inferenceTts!;

    const session = new voice.AgentSession({
      vad: userData.vad,
      stt: translationStt,
      llm: new PassthroughTranslationLLM(),
      tts: sessionTts,
      /** Voisa is user-mic → STT only at session start; no agent playback yet — skip AEC discard window. */
      aecWarmupDuration: 0,
      turnHandling: {
        // Soniox emits START_OF_SPEECH / END_OF_SPEECH / FINAL_TRANSCRIPT — no HuggingFace ONNX models required.
        // (Multilingual EOU via @livekit/agents-plugin-livekit needs `download-files` + reachable huggingface.co.)
        turnDetection: 'stt',
        /**
         * Simultaneous interpretation: the user speaking is the input, not a barge-in on the agent. Disable the
         * AgentSession's automatic interruption so coordinator `say()` chunks are not force-closed mid-playback
         * (which surfaces as `speech interrupted, new user turn detected` + `endAudioInput called after close`).
         */
        interruption: {
          resumeFalseInterruption: true,
          falseInterruptionTimeout: 60_000,
          mode: 'vad',
        },
        endpointing: {
          mode: 'dynamic',
          minDelay: 400,
          maxDelay: 2800,
        },
        /**
         * Disabled: PassthroughTranslationLLM emits no tokens, so preemptive runs produce empty TTS chains
         * (`firstFrameFut cancelled before first frame`, `SegmentSynchronizerImpl.markPlaybackFinished … textDone: false`).
         * Translation TTS is driven by {@link VoisaInterpretationCoordinator} from `voisa.transcript`.
         */
        preemptiveGeneration: {
          enabled: false,
        },
      },
      ttsTextTransforms: ['filter_markdown', 'filter_emoji'],
      useTtsAlignedTranscript: sonioxTts === undefined,
    });

    interpretation = new VoisaInterpretationCoordinator(session, logger);

    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      metrics.logMetrics(ev.metrics);
    });

    session.on(voice.AgentSessionEventTypes.OverlappingSpeech, (ev) => {
      logger.warn({ type: ev.type, isInterruption: ev.isInterruption }, 'overlapping speech');
    });

    const agent = new voice.Agent({
      instructions:
        'Do not initiate conversation and do not add commentary. The pipeline speaks only translated user text.',
    });

    const applyLanguagePayload = (payload: Record<string, unknown>) => {
      if (payload.type !== 'voisa.language_pair') return;
      const languageA = typeof payload.languageA === 'string' ? payload.languageA : '';
      const languageB = typeof payload.languageB === 'string' ? payload.languageB : '';
      const ok = translationStt.applyLanguagePair(languageA, languageB);
      if (!ok) logger.warn({ languageA, languageB }, 'ignored voisa.language_pair');
      else {
        logger.info({ languageA, languageB }, 'applied voisa.language_pair');
        sonioxTts?.setLanguage(languageB);
        inferenceTts?.updateOptions({ language: normalizeLanguage(languageB.trim().toLowerCase()) });
      }

      const domainRaw = payload.translationDomain;
      const termsRaw = payload.translationTerms;
      if (typeof domainRaw === 'string' || Array.isArray(termsRaw)) {
        const terms: { source: string; target: string }[] = [];
        if (Array.isArray(termsRaw)) {
          for (const item of termsRaw) {
            if (!item || typeof item !== 'object') continue;
            const o = item as Record<string, unknown>;
            const s = typeof o.source === 'string' ? o.source : '';
            const t = typeof o.target === 'string' ? o.target : '';
            if (s.trim() && t.trim()) terms.push({ source: s.trim(), target: t.trim() });
          }
        }
        translationStt.applyClientContextHints({
          ...(typeof domainRaw === 'string' ? { domain: domainRaw } : {}),
          ...(Array.isArray(termsRaw) ? { translationTerms: terms } : {}),
        });
      }
    };

    /** Apply payloads without requiring a `participant`: rtc-node can emit `RoomEvent.DataReceived` before the sender is indexed in `remoteParticipants`, which previously skipped `voisa.language_pair` and left Soniox on `.env` defaults (often en/es). */
    const onUserData = (data: Uint8Array) => {
      const msg = decodeVoisaJson(data);
      if (!msg) return;
      applyLanguagePayload(msg);
    };

    ctx.room.on(RoomEvent.DataReceived, onUserData);
    ctx.room.once(RoomEvent.Disconnected, () => {
      ctx.room.off(RoomEvent.DataReceived, onUserData);
    });

    /**
     * Do not unregister `DataReceived` in `finally` after `start()`: `AgentSession.start` resolves once
     * bootstrap finishes — the Expo client publishes `voisa.language_pair` after that every time — so tearing
     * down the listener there dropped language updates entirely and Soniox stayed on `TRANSLATION_LANGUAGE_*`.
     */
    await session.start({
      agent,
      room: ctx.room,
      outputOptions: {
        /** https://docs.livekit.io/agents/multimodality/text/ — `false` sends captions as soon as available vs playback sync */
        syncTranscription: parseEnvBool('VOISA_SYNC_TRANSCRIPTION', true),
      },
    });
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: 'translator-agent',
  }),
);
