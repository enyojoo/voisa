import { voice } from '@livekit/agents';

type LkLogger = ReturnType<typeof import('@livekit/agents').log>;

type MetricsCollectedPayload = {
  metrics: {
    type: string;
    speechId?: string;
    ttfbMs?: number;
    durationMs?: number;
    audioDurationMs?: number;
    charactersCount?: number;
    cancelled?: boolean;
    label?: string;
    streamed?: boolean;
  };
};

/**
 * When `VOISA_CRACK_DIAGNOSE=1`, logs structured TTS/STT/VAD metrics so you can correlate
 * `ttfbMs` / `audioDurationMs` / `durationMs` with audible crackling.
 *
 * Note: `inference is slower than realtime` in worker logs comes from **Silero VAD**
 * (`@livekit/agents-plugin-silero`), not Soniox TTS — correlate timestamps separately.
 */
export function attachVoisaCrackDiagnostics(
  session: InstanceType<typeof voice.AgentSession>,
  logger: LkLogger,
): void {
  if (process.env.VOISA_CRACK_DIAGNOSE?.trim() !== '1') return;

  session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev: MetricsCollectedPayload) => {
    const m = ev.metrics;
    if (m.type === 'tts_metrics') {
      logger.info(
        {
          voisaCrackDiagnose: 'tts',
          speechId: m.speechId,
          ttfbMs: m.ttfbMs,
          durationMs: m.durationMs,
          audioDurationMs: m.audioDurationMs,
          charactersCount: m.charactersCount,
          cancelled: m.cancelled,
          label: m.label,
        },
        'VOISA_CRACK_DIAGNOSE tts_metrics',
      );
    } else if (m.type === 'stt_metrics') {
      logger.info(
        {
          voisaCrackDiagnose: 'stt',
          durationMs: m.durationMs,
          audioDurationMs: m.audioDurationMs,
          streamed: m.streamed,
          label: m.label,
        },
        'VOISA_CRACK_DIAGNOSE stt_metrics',
      );
    } else if (m.type === 'vad_metrics') {
      logger.info({ voisaCrackDiagnose: 'vad', label: m.label }, 'VOISA_CRACK_DIAGNOSE vad_metrics');
    }
  });
}
