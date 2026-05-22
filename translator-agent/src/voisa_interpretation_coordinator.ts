import { ReadableStream } from 'node:stream/web';
import { log, voice } from '@livekit/agents';

import type { VoisaTranscriptBridgePayload } from './soniox_stt.js';

type LkLogger = ReturnType<typeof log>;
type SpeechHandle = ReturnType<voice.AgentSession['say']>;

function parseEnvInt(key: string, fallback: number, min: number, max: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseEnvBool(key: string, defaultVal: boolean): boolean {
  const v = process.env[key]?.trim().toLowerCase();
  if (!v) return defaultVal;
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return defaultVal;
}

/**
 * Phrase-aware chunking for Soniox TTS. Larger MIN reduces seam pops / mux churn; higher latency before first chunk.
 * Override with `VOISA_TTS_MIN_CHUNK_CHARS`, `VOISA_TTS_MAX_CHUNK_CHARS`, `VOISA_TTS_DEBOUNCE_MS`.
 *
 * Defaults biased toward **fewer, longer** `say()` units — smoother playback than many tiny chunks.
 */
const MIN_CHUNK = parseEnvInt('VOISA_TTS_MIN_CHUNK_CHARS', 44, 8, 400);
const MAX_CHUNK = parseEnvInt('VOISA_TTS_MAX_CHUNK_CHARS', 140, MIN_CHUNK, 800);
const DEBOUNCE_MS = parseEnvInt('VOISA_TTS_DEBOUNCE_MS', 260, 40, 2000);
/** Chunk mode: debounce flush only fires if this many chars are buffered (avoids 1–2 word “stutter” reads). */
const DEBOUNCE_FLUSH_MIN_CHARS = parseEnvInt('VOISA_TTS_DEBOUNCE_FLUSH_MIN_CHARS', 28, 8, 400);
const BREAK_RE = /[.!?。！？…,;:，、]/;

const DEBUG_TTS_QUEUE = parseEnvBool('VOISA_DEBUG_TTS_QUEUE', false);
/** Cap `say()` bursts per single `#pump` pass — avoids opening many concurrent Soniox streams (mux max 5). */
const MAX_SAYS_PER_PUMP = parseEnvInt('VOISA_TTS_MAX_SAYS_PER_PUMP', 3, 1, 5);

/**
 * One `say(ReadableStream<string>)` per utterance — translation deltas append into the same Soniox stream so
 * playback **continues** while partials grow (default **on**). Set `VOISA_TTS_USE_TEXT_STREAM=0` for chunk mode.
 */
const USE_TEXT_STREAM = parseEnvBool('VOISA_TTS_USE_TEXT_STREAM', true);

/** Stream mode: wait for this much new translated text before first enqueue in an utterance (reduces instant micro-speak). */
const STREAM_MIN_CHARS = parseEnvInt('VOISA_TTS_STREAM_MIN_CHARS', 8, 0, 200);

/** Lenient ASR: only drop in-flight TTS when a **finalized** utterance plainly contradicts prior source (never on partial drafts). */
const ASR_REWRITE_STRICT = parseEnvBool('VOISA_ASR_REWRITE_STRICT', false);
/** Lower defaults tolerate short phrases; finals-only comparisons keep playout stable under interim jitter. */
const ASR_REWRITE_MIN_COMMON = parseEnvInt('VOISA_ASR_REWRITE_MIN_COMMON_CHARS', 6, 1, 128);

function commonPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

function sanitizeLine(s: string | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function ttsLine(p: VoisaTranscriptBridgePayload): string {
  return sanitizeLine(p.translated);
}

/**
 * Queues `session.say` from streaming `voisa.transcript` (translation only).
 *
 * **Stream mode (default, `VOISA_TTS_USE_TEXT_STREAM=1`):** one `say(ReadableStream<string>)` per utterance —
 * translated text **appends** into the same Soniox stream while partials arrive, so readout continues through
 * the growing line until Soniox finalizes the utterance.
 *
 * **Chunk mode (`VOISA_TTS_USE_TEXT_STREAM=0`):** serialized `say(string)` chunks; debounced flush avoids
 * speaking sub-`VOISA_TTS_DEBOUNCE_FLUSH_MIN_CHARS` crumbs until enough text accumulates or a final lands.
 */
export class VoisaInterpretationCoordinator {
  readonly #session: voice.AgentSession;
  readonly #log: LkLogger;
  #cumulative = '';
  #cumulativeOriginal = '';
  #buf = '';
  #debounce: ReturnType<typeof setTimeout> | null = null;
  /** One in-flight `session.say` at a time — parallel `say()` was starving mux / playout and caused crackle. */
  #speechChain: Promise<void> = Promise.resolve();
  #closed = false;

  /** Serialized async work for {@link USE_TEXT_STREAM} (open / enqueue / close). */
  #streamJob: Promise<void> = Promise.resolve();
  #streamCtrl: ReadableStreamDefaultController<string> | null = null;
  #streamSpeechHandle: SpeechHandle | null = null;
  #streamSentLen = 0;

  constructor(session: voice.AgentSession, logger: LkLogger) {
    this.#session = session;
    this.#log = logger;
    session.on(voice.AgentSessionEventTypes.Close, () => {
      this.#closed = true;
      this.#resetBuffers();
    });
  }

  #resetBuffers(): void {
    if (this.#debounce) {
      clearTimeout(this.#debounce);
      this.#debounce = null;
    }
    if (USE_TEXT_STREAM) {
      void this.#runStreamJob(async () => {
        await this.#closeStreamAndAwaitPlayout();
        this.#cumulative = '';
        this.#cumulativeOriginal = '';
        this.#buf = '';
      });
    } else {
      this.#cumulative = '';
      this.#cumulativeOriginal = '';
      this.#buf = '';
    }
  }

  #shouldInvalidateTranslationBuffer(prev: string, o: string): boolean {
    if (prev.length === 0 || o.length === 0) return false;
    if (o.startsWith(prev) || prev.startsWith(o)) return false;
    if (ASR_REWRITE_STRICT) return true;
    const common = commonPrefixLength(prev, o);
    return common < ASR_REWRITE_MIN_COMMON;
  }

  /**
   * Interim `original` zig-zags (“hello wor…” → glitch → “tell me…”); wiping TTS mid-utterance on every jitter
   * skips most of the translation. Invalidate only after Soniox marks **`isFinal`**, matching a committed hypothesis.
   */
  #syncOriginalAndMaybeInvalidateTranslation(original: string, isFinal: boolean): void {
    const o = sanitizeLine(original);
    const prev = this.#cumulativeOriginal;
    if (isFinal && this.#shouldInvalidateTranslationBuffer(prev, o)) {
      this.#cumulative = '';
      this.#buf = '';
      this.#streamSentLen = 0;
      if (USE_TEXT_STREAM) {
        void this.#runStreamJob(() => this.#closeStreamAndAwaitPlayout());
      }
      if (DEBUG_TTS_QUEUE) {
        this.#log.debug(
          { prevLen: prev.length, newLen: o.length, prevTail: prev.slice(-24), newTail: o.slice(-24) },
          'VoisaInterpretationCoordinator ASR rewrite — cleared translation TTS buffer',
        );
      }
    }
    this.#cumulativeOriginal = o;
  }

  #appendDelta(nextLine: string): void {
    const next = nextLine.trim();
    if (!next) return;

    const prev = this.#cumulative;
    if (!prev) {
      this.#cumulative = next;
      this.#buf = next;
    } else if (next.startsWith(prev)) {
      this.#buf += next.slice(prev.length);
      this.#cumulative = next;
    } else if (prev.startsWith(next)) {
      /** Shorter canonical translation — discard stale pending tail (do not append onto superseded text). */
      this.#cumulative = next;
      this.#buf = '';
      if (USE_TEXT_STREAM) {
        this.#streamSentLen = Math.min(this.#streamSentLen, next.length);
      }
    } else {
      const common = commonPrefixLength(prev, next);
      this.#cumulative = next;
      this.#buf = next.slice(common);
      if (USE_TEXT_STREAM) {
        this.#streamSentLen = Math.min(this.#streamSentLen, common);
      }
    }

    if (USE_TEXT_STREAM) {
      this.#streamSentLen = Math.min(this.#streamSentLen, this.#cumulative.length);
    }
  }

  #pickChunk(pending: string, phraseMode: boolean, shortFinal = false): string {
    const t = pending.trimStart();
    if (!t) return '';
    if (!phraseMode && t.length < MIN_CHUNK) return '';
    const lim = Math.min(t.length, Math.max(MIN_CHUNK, MAX_CHUNK));
    for (let i = lim - 1; i >= MIN_CHUNK - 1; i--) {
      const ch = t[i];
      if (ch && BREAK_RE.test(ch)) return t.slice(0, i + 1).trim();
    }
    if (phraseMode) {
      if (!shortFinal && t.trim().length < Math.min(MIN_CHUNK, DEBOUNCE_FLUSH_MIN_CHARS)) return '';
      return t.trim();
    }
    const sp = t.lastIndexOf(' ', MAX_CHUNK);
    if (sp >= MIN_CHUNK - 1) return t.slice(0, sp).trim();
    if (t.length >= MAX_CHUNK) return t.slice(0, MAX_CHUNK).trim();
    return '';
  }

  #say(text: string): void {
    const chunk = text.trim();
    if (!chunk) return;
    if (this.#closed) return;

    this.#speechChain = this.#speechChain.then(async () => {
      if (this.#closed) return;
      const handle = this.#session.say(chunk, {
        allowInterruptions: false,
        addToChatCtx: false,
      });

      if (DEBUG_TTS_QUEUE) {
        this.#log.debug(
          { chunkLen: chunk.length, chunkTail: chunk.slice(-48) },
          'VoisaInterpretationCoordinator say started',
        );
      }

      await handle.waitForPlayout().catch((e) => {
        if (this.#closed) return;
        this.#log.warn({ err: e }, 'VoisaInterpretationCoordinator waitForPlayout failed');
      });
    });
  }

  #pump(shortOk: boolean, shortFinal = false): void {
    let b = this.#buf.trimStart();
    let emitted = 0;
    const cap = shortOk ? Number.POSITIVE_INFINITY : MAX_SAYS_PER_PUMP;
    for (;;) {
      if (emitted >= cap) break;
      const phraseMode = shortOk && b.trim().length > 0 && b.trim().length < MIN_CHUNK;
      const chunk = this.#pickChunk(b, phraseMode, shortFinal);
      if (!chunk) break;
      const tb = b.trimStart();
      if (!tb.startsWith(chunk)) break;
      const lead = b.length - tb.length;
      b = b.slice(lead + chunk.length);
      this.#say(chunk);
      emitted++;
    }
    this.#buf = b.trimStart();
  }

  /** First enqueue of a stream utterance waits for enough translated text; then all suffixes flow continuously. */
  #streamPieceReady(piece: string, isFinal: boolean): boolean {
    if (!piece) return false;
    if (isFinal || STREAM_MIN_CHARS <= 0) return true;
    if (this.#streamSentLen > 0) return true;
    return piece.length >= STREAM_MIN_CHARS;
  }

  #runStreamJob(fn: () => void | Promise<void>): void {
    this.#streamJob = this.#streamJob.then(() => fn()).catch((e) => {
      if (!this.#closed) this.#log.warn({ err: e }, 'VoisaInterpretationCoordinator stream job failed');
    });
  }

  #startStreamIfNeeded(): void {
    if (this.#closed || this.#streamCtrl !== null) return;
    const stream = new ReadableStream<string>({
      start: (controller) => {
        this.#streamCtrl = controller;
      },
    });
    this.#streamSpeechHandle = this.#session.say(stream, {
      allowInterruptions: false,
      addToChatCtx: false,
    });
  }

  async #closeStreamAndAwaitPlayout(): Promise<void> {
    if (this.#streamCtrl) {
      try {
        this.#streamCtrl.close();
      } catch {
        /* already closed */
      }
      this.#streamCtrl = null;
    }
    const h = this.#streamSpeechHandle;
    this.#streamSpeechHandle = null;
    this.#streamSentLen = 0;
    if (h) {
      await h.waitForPlayout().catch(() => undefined);
    }
  }

  onTranscript(payload: VoisaTranscriptBridgePayload): void {
    this.#syncOriginalAndMaybeInvalidateTranslation(payload.original ?? '', payload.isFinal);

    const line = ttsLine(payload);

    if (USE_TEXT_STREAM) {
      if (payload.isFinal) {
        if (this.#debounce) {
          clearTimeout(this.#debounce);
          this.#debounce = null;
        }
        this.#appendDelta(line);
        void this.#runStreamJob(async () => {
          if (this.#closed) return;
          const startLen = this.#streamSentLen;
          const full = this.#cumulative;
          const piece = full.slice(startLen);
          if (piece) {
            this.#startStreamIfNeeded();
            this.#streamCtrl?.enqueue(piece);
            this.#streamSentLen = startLen + piece.length;
          } else if (!this.#streamCtrl && !this.#streamSpeechHandle) {
            /* nothing to speak */
          } else {
            this.#startStreamIfNeeded();
          }
          await this.#closeStreamAndAwaitPlayout();
          this.#cumulative = '';
          this.#cumulativeOriginal = '';
          this.#buf = '';
        });
        return;
      }

      if (!line) return;
      this.#appendDelta(line);

      void this.#runStreamJob(async () => {
        if (this.#closed) return;
        const full = this.#cumulative;
        const startLen = this.#streamSentLen;
        const piece = full.slice(startLen);
        if (!this.#streamPieceReady(piece, false)) return;
        this.#startStreamIfNeeded();
        this.#streamCtrl?.enqueue(piece);
        this.#streamSentLen = startLen + piece.length;
      });

      if (this.#debounce) clearTimeout(this.#debounce);
      this.#debounce = setTimeout(() => {
        this.#debounce = null;
        void this.#runStreamJob(async () => {
          if (this.#closed) return;
          const full = this.#cumulative;
          const startLen = this.#streamSentLen;
          const piece = full.slice(startLen);
          if (!this.#streamPieceReady(piece, false)) return;
          this.#startStreamIfNeeded();
          this.#streamCtrl?.enqueue(piece);
          this.#streamSentLen = startLen + piece.length;
        });
      }, DEBOUNCE_MS);
      return;
    }

    if (payload.isFinal) {
      if (this.#debounce) {
        clearTimeout(this.#debounce);
        this.#debounce = null;
      }
      this.#appendDelta(line);
      this.#pump(true, true);
      this.#cumulative = '';
      this.#cumulativeOriginal = '';
      this.#buf = '';
      return;
    }

    if (!line) return;
    this.#appendDelta(line);

    this.#pump(false);

    if (this.#debounce) clearTimeout(this.#debounce);
    this.#debounce = setTimeout(() => {
      this.#debounce = null;
      this.#pump(true, false);
    }, DEBOUNCE_MS);
  }
}
