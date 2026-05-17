import { log, voice } from '@livekit/agents';

import type { VoisaTranscriptBridgePayload } from './soniox_stt.js';

type LkLogger = ReturnType<typeof log>;

/**
 * Tuning (device A/B): larger chunks → fewer Soniox TTS stream boundaries → cleaner audio (each boundary is a
 * mux create/terminate roundtrip that can produce clicks). Smaller chunks → snappier first syllable / simultaneity.
 * ~48 chars ≈ short clause; ~240 caps one longer clause before splitting.
 * Align with `BRIDGE_COALESCE_MS` in `soniox_stt.ts`.
 */
const MIN_CHUNK = 48;
const MAX_CHUNK = 240;
const DEBOUNCE_MS = 320;
const BREAK_RE = /[.!?。！？…,;:，、]/;

function commonPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

/**
 * TTS strictly the translated string. We never fall back to `original`: speaking the source language with the
 * target-language voice sounds wrong and steals the playback slot from the real translation arriving moments later.
 */
function ttsLine(p: VoisaTranscriptBridgePayload): string {
  return (p.translated ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Queues `session.say` from streaming `voisa.transcript` (translation preferred), with phrase-aware chunking
 * and `waitForPlayout` between chunks. User `speaking` state clears the queue and interrupts audio.
 *
 * {@link PassthroughTranslationLLM} is kept empty so the default end-of-turn TTS path does not duplicate output.
 */
export class VoisaInterpretationCoordinator {
  readonly #session: voice.AgentSession;
  readonly #log: LkLogger;
  /** Last cumulative line from Soniox for this utterance (partial stream). */
  #cumulative = '';
  /** Prefix of `#cumulative` that has already been pushed into the TTS chain. */
  #spokenLen = 0;
  /** Text not yet passed to `say()` (always `#cumulative.slice(#spokenLen)`). */
  #buf = '';
  #debounce: ReturnType<typeof setTimeout> | null = null;
  #chain: Promise<void> = Promise.resolve();
  #closed = false;

  constructor(session: voice.AgentSession, logger: LkLogger) {
    this.#session = session;
    this.#log = logger;
    /**
     * Intentionally no `UserStateChanged → speaking` barge-in: this is simultaneous interpretation, not a
     * conversational agent. The user is the source; the coordinator must keep queuing translated chunks while
     * the speaker continues, not interrupt itself and discard pending text.
     */
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
    this.#cumulative = '';
    this.#spokenLen = 0;
    this.#buf = '';
  }

  /**
   * Fold the newest cumulative line into pending speech. Pending = `cumulative.slice(spokenLen)`. We never re-say
   * what's already been queued (would duplicate audio) and we never silently drop pending characters (would skip
   * words). For partial rewrites where the common prefix is shorter than what was already spoken, we resync `buf`
   * to start at the diverge point but cap it at `spokenLen` to avoid duplication.
   */
  #appendDelta(nextLine: string): void {
    const next = nextLine.trim();
    if (!next) return;

    const prev = this.#cumulative;
    if (!prev) {
      this.#cumulative = next;
      this.#spokenLen = 0;
      this.#buf = next;
      return;
    }

    if (next.startsWith(prev)) {
      this.#cumulative = next;
      this.#buf = next.slice(this.#spokenLen);
      return;
    }

    const common = commonPrefixLength(prev, next);
    this.#cumulative = next;
    /** Never replay already-spoken audio — start `buf` after the spoken prefix, never before. */
    const sayFrom = Math.max(common, this.#spokenLen);
    this.#spokenLen = Math.min(this.#spokenLen, next.length);
    this.#buf = next.slice(sayFrom);
  }

  #pickChunk(pending: string, shortOk: boolean): string {
    const t = pending.trimStart();
    if (!t) return '';
    if (!shortOk && t.length < MIN_CHUNK) return '';
    const lim = Math.min(t.length, Math.max(MIN_CHUNK, MAX_CHUNK));
    for (let i = lim - 1; i >= MIN_CHUNK - 1; i--) {
      const ch = t[i];
      if (ch && BREAK_RE.test(ch)) return t.slice(0, i + 1).trim();
    }
    if (shortOk) return t.trim();
    const sp = t.lastIndexOf(' ', MAX_CHUNK);
    if (sp >= MIN_CHUNK - 1) return t.slice(0, sp).trim();
    if (t.length >= MAX_CHUNK) return t.slice(0, MAX_CHUNK).trim();
    return '';
  }

  #say(text: string): void {
    const chunk = text.trim();
    if (!chunk) return;
    this.#chain = this.#chain.then(async () => {
      if (this.#closed) return;
      try {
        /**
         * `allowInterruptions: false` so the AgentSession's turn handler does not force-close a chunk mid-playback
         * when the speaker keeps talking — that produces `SegmentSynchronizerImpl.endAudioInput called after close`
         * and cuts the translation audio half-way. The coordinator owns when to interrupt (it does not).
         */
        await this.#session.say(chunk, { allowInterruptions: false }).waitForPlayout();
      } catch (e) {
        if (this.#closed) return;
        this.#log.warn({ err: e }, 'VoisaInterpretationCoordinator say failed');
      }
    });
  }

  /** Emit one or more chunks from `#buf` when length / punctuation allows. */
  #pump(shortOk: boolean): void {
    let b = this.#buf;
    for (;;) {
      const chunk = this.#pickChunk(b, shortOk && b.trim().length < MIN_CHUNK && b.trim().length > 0);
      if (!chunk) break;
      const pos = b.indexOf(chunk);
      if (pos < 0) break;
      const consumed = pos + chunk.length;
      b = b.slice(consumed);
      this.#spokenLen += consumed;
      this.#say(chunk);
    }
    this.#buf = b;
  }

  /** Drain whatever remains in `#buf` as one final chunk, regardless of length / break punctuation. */
  #flushAll(): void {
    const tail = this.#buf.trim();
    if (!tail) return;
    this.#spokenLen += this.#buf.length;
    this.#buf = '';
    this.#say(tail);
  }

  onTranscript(payload: VoisaTranscriptBridgePayload): void {
    const line = ttsLine(payload);

    if (payload.isFinal) {
      if (this.#debounce) {
        clearTimeout(this.#debounce);
        this.#debounce = null;
      }
      this.#appendDelta(line);
      this.#pump(true);
      /**
       * Force-flush any tail that pump couldn't break cleanly (e.g. "well today" with no punctuation under
       * MAX_CHUNK) — otherwise the final word(s) of each utterance get silently dropped from playback.
       */
      this.#flushAll();
      /**
       * Reset utterance tracker; the next utterance starts fresh. Already-queued chunks finish uninterrupted
       * because `#chain` lives on.
       */
      this.#cumulative = '';
      this.#spokenLen = 0;
      this.#buf = '';
      return;
    }

    if (!line) return;
    this.#appendDelta(line);

    this.#pump(false);

    if (this.#debounce) clearTimeout(this.#debounce);
    this.#debounce = setTimeout(() => {
      this.#debounce = null;
      this.#pump(true);
    }, DEBOUNCE_MS);
  }
}
