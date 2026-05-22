import {
    AudioByteStream,
    log,
    normalizeLanguage,
    stt,
    waitForAbort,
    type LanguageCode,
} from '@livekit/agents';
import dns from 'node:dns';
import https from 'node:https';
import { AudioFrame } from '@livekit/rtc-node';
import WebSocket, { type ClientOptions } from 'ws';

import { SONIOX_LANGUAGE_CODES } from './soniox_language_allowlist.js';
import {
  defaultSonioxSttWebSocketUrl,
  parseSonioxRegion,
  sonioxRegionHostnameMismatch,
  type SonioxRegion,
} from './soniox_region.js';

/**
 * Transcript transport (Voisa + LiveKit):
 * - **`voisa.transcript`** (`publishData`): authoritative bilingual stream — `original`, `translated`, `isFinal`
 *   from Soniox tokens (`translation_status` interleaving per https://soniox.com/docs/stt/rt/real-time-translation).
 * - **`lk.transcription`** (text stream): LiveKit Agents user captions from STT `SpeechEvent` text; use
 *   `lk.segment_id` + `lk.transcription_final` on the client to replace interim with final
 *   (https://docs.livekit.io/agents/multimodality/text/).
 */

/** Some networks (often broken IPv6 on macOS / Wi‑Fi) drop TLS to Soniox during handshake (`ECONNRESET` before Established). Omit or `verbatim` to use Node defaults. https://nodejs.org/api/dns.html#dnssetdefaultresultorderorder */
const sonioxDnsOrder = process.env.SONIOX_STT_DNS_RESULT_ORDER?.trim().toLowerCase();
if (sonioxDnsOrder === 'verbatim') {
    dns.setDefaultResultOrder('verbatim');
} else {
    dns.setDefaultResultOrder('ipv4first');
}

function sonioxWsHandshakeMs(): number {
    const raw = process.env.SONIOX_WS_HANDSHAKE_TIMEOUT_MS?.trim();
    if (!raw?.length) return 20_000;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 5_000 ? Math.floor(n) : 20_000;
}

const sonioxSttHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 48 });

function sonioxSttWsOptions(): ClientOptions {
    return { agent: sonioxSttHttpsAgent, handshakeTimeout: sonioxWsHandshakeMs() };
}

function looksLikeTlsHandshakeNoise(e: unknown): boolean {
    if (!e || typeof e !== 'object') return false;
    const err = e as NodeJS.ErrnoException;
    const flaky = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH', 'EPIPE', 'EAI_AGAIN'];
    if (typeof err.code === 'string' && flaky.includes(err.code)) return true;
    const msg = String((e as Error).message ?? '');
    return /socket disconnected before secure tls connection was established|tls|handshake|tls connection/i.test(msg);
}

/** Soniox realtime WS: quotas https://soniox.com/docs/stt/rt/limits-and-quotas · errors https://soniox.com/docs/stt/rt/error-handling */
export type VoisaTranscriptBridgePayload = {
  type: 'voisa.transcript';
  original: string;
  translated: string;
  detectedLanguage: string | null;
  isFinal: boolean;
};

/** Soniox HTTP-like codes that won't recover by reconnecting (billing, auth). */
const SONIOX_NONRETRY_CODES = new Set([401, 402, 403]);

export class SonioxFatalError extends Error {
  readonly sonioxCode: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'SonioxFatalError';
    this.sonioxCode = code;
  }
}

export type SonioxBridgeHandler = (payload: VoisaTranscriptBridgePayload) => void;

export type SonioxToken = {
  text?: string;
  is_final?: boolean;
  translation_status?: 'none' | 'original' | 'translation';
  language?: string;
  confidence?: number;
  start_ms?: number;
  end_ms?: number;
};

type SonioxResponse = {
  tokens?: SonioxToken[];
  finished?: boolean;
  error_code?: number;
  error_message?: string;
  final_audio_proc_ms?: number;
  total_audio_proc_ms?: number;
};

/** Soniox may close RT sockets after ~20s without audio — ping more often during silence/VAD gaps. https://soniox.com/docs/stt/rt/connection-keepalive */
const SONIOX_KEEPALIVE_INTERVAL_MS = 12_000;

const MAX_PERSIST_FINALS = 900;

/**
 * iOS (and some Android) WebRTC often publishes **stereo** mic PCM. `@livekit/agents` `SpeechStream.pushFrame`
 * builds `AudioResampler` with the default **1 channel**, so interleaved stereo is mis-decoded → Soniox
 * sees garbage / silence and never emits tokens (empty interim transcripts, user-away).
 */
function downmixInterleavedStereoS16ToMono(data: Int16Array, samplesPerChannel: number): Int16Array {
  const out = new Int16Array(samplesPerChannel);
  for (let i = 0; i < samplesPerChannel; i++) {
    const l = data[i * 2] ?? 0;
    const r = data[i * 2 + 1] ?? 0;
    out[i] = (l + r) >> 1;
  }
  return out;
}

function isOriginalToken(t: SonioxToken): boolean {
  const s = t.translation_status;
  return s === undefined || s === 'none' || s === 'original';
}

function isTranslationToken(t: SonioxToken): boolean {
  return t.translation_status === 'translation';
}

function concatSpoken(tokens: SonioxToken[]): string {
  return tokens
    .filter((t) => t.text && isOriginalToken(t))
    .map((t) => t.text as string)
    .join('');
}

function concatTranslated(tokens: SonioxToken[]): string {
  return tokens
    .filter((t) => t.text && isTranslationToken(t))
    .map((t) => t.text as string)
    .join('');
}

function detectLanguage(tokens: SonioxToken[]): string | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (!t.language) continue;
    if (!isOriginalToken(t)) continue;
    return t.language;
  }
  return null;
}

function trimPersistFinals(list: SonioxToken[]): void {
  while (list.length > MAX_PERSIST_FINALS) list.shift();
}

/** Soniox may repeat the same final token across WS messages; pushing twice duplicates source text in `concatSpoken`. */
function sonioxFinalTokenKey(t: SonioxToken): string | null {
  const { start_ms: a, end_ms: b } = t;
  if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)) {
    return `${a}\0${b}\0${t.translation_status ?? 'none'}\0${t.text ?? ''}`;
  }
  return null;
}

/** Fallback when timestamps are missing: collapses redundant repeated finals only (immediate neighbor). */
function sonioxWeakFinalDedupKey(t: SonioxToken): string | null {
  if (!t.is_final || typeof t.text !== 'string') return null;
  const text = String(t.text).trim();
  if (!text) return null;
  return `${t.translation_status ?? 'none'}\0${text}`;
}

function persistFinalsHasDuplicate(list: SonioxToken[], token: SonioxToken): boolean {
  const strong = sonioxFinalTokenKey(token);
  if (strong) {
    for (const p of list) {
      if (sonioxFinalTokenKey(p) === strong) return true;
    }
    return false;
  }
  if (!token.is_final) return false;
  const w = sonioxWeakFinalDedupKey(token);
  if (!w) return false;
  const last = list[list.length - 1];
  return last ? sonioxWeakFinalDedupKey(last) === w : false;
}

/** Soniox semantic endpoint marker (`<end>`). See https://soniox.com/docs/stt/rt/endpoint-detection */
function isSonioxUtteranceEndMarker(token: SonioxToken): boolean {
  if (!token.is_final || token.text === undefined || token.text === null) return false;
  const s = String(token.text).trim();
  return s === '<end>' || /^<end\b[^>]*>$/i.test(s);
}

/** Strip Soniox/stream markers (e.g. literal `<end>`) before bridge / TTS. */
function sanitizeSonioxStreamText(text: string): string {
  return text
    .replace(/<\/?end>/gi, '')
    .replace(/<end\b[^>]*>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampSonioxLang(code: string | undefined, fallback: string): string {
  const c = (code ?? '').trim().toLowerCase();
  return SONIOX_LANGUAGE_CODES.has(c) ? c : fallback;
}

export type SonioxTranslationSTTOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  languageA?: string;
  languageB?: string;
  languageHints?: string[];
  maxEndpointDelayMs?: number;
  finalizeQuietMs?: number;
  sampleRate?: number;
  numChannels?: number;
  onBridge?: SonioxBridgeHandler;
  /** Called once when Soniox returns a non-retryable error (e.g. 402 billing). */
  onFatal?: (message: string) => void;
};

type ResolvedSonioxOpts = {
  apiKey: string;
  baseUrl: string;
  sonioxRegion: SonioxRegion;
  model: string;
  languageA: string;
  languageB: string;
  languageHints: string[];
  maxEndpointDelayMs: number;
  finalizeQuietMs: number;
  sampleRate: number;
  numChannels: number;
  /** Merged into Soniox `context` on each websocket start — from env; client hints merged at send time. */
  envContextBase: Record<string, unknown> | undefined;
  /** Mutable — updated from optional `voisa.language_pair` fields without replacing `ResolvedSonioxOpts` identity. */
  clientHintsBox: {
    hints: { domain?: string; translationTerms?: { source: string; target: string }[] };
  };
};

function parseEnvSonioxContextBase(): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  const ctxJson = process.env.SONIOX_CONTEXT_JSON?.trim();
  if (ctxJson) {
    try {
      const parsed = JSON.parse(ctxJson) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.assign(out, parsed as Record<string, unknown>);
      } else {
        log().warn('SONIOX_CONTEXT_JSON must be a JSON object — ignored');
      }
    } catch {
      log().warn('SONIOX_CONTEXT_JSON is not valid JSON — ignored');
    }
  }

  const genJson = process.env.SONIOX_CONTEXT_GENERAL_JSON?.trim();
  if (genJson) {
    try {
      const parsed = JSON.parse(genJson) as unknown;
      if (Array.isArray(parsed)) {
        const existing = out.general;
        const prev = Array.isArray(existing) ? (existing as unknown[]) : [];
        out.general = [...prev, ...parsed];
      } else {
        log().warn('SONIOX_CONTEXT_GENERAL_JSON must be a JSON array — ignored');
      }
    } catch {
      log().warn('SONIOX_CONTEXT_GENERAL_JSON is not valid JSON — ignored');
    }
  }

  const text = process.env.SONIOX_CONTEXT_TEXT?.trim();
  if (text) out.text = text;

  const termsJson = process.env.SONIOX_CONTEXT_TERMS_JSON?.trim();
  if (termsJson) {
    try {
      const parsed = JSON.parse(termsJson) as unknown;
      if (Array.isArray(parsed)) out.terms = parsed;
      else log().warn('SONIOX_CONTEXT_TERMS_JSON must be a JSON array — ignored');
    } catch {
      log().warn('SONIOX_CONTEXT_TERMS_JSON is not valid JSON — ignored');
    }
  }

  const transTermsJson = process.env.SONIOX_TRANSLATION_TERMS_JSON?.trim();
  if (transTermsJson) {
    try {
      const parsed = JSON.parse(transTermsJson) as unknown;
      if (Array.isArray(parsed)) {
        const existing = out.translation_terms;
        const prev = Array.isArray(existing) ? (existing as unknown[]) : [];
        out.translation_terms = [...prev, ...parsed];
      } else {
        log().warn('SONIOX_TRANSLATION_TERMS_JSON must be a JSON array — ignored');
      }
    } catch {
      log().warn('SONIOX_TRANSLATION_TERMS_JSON is not valid JSON — ignored');
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function mergeSonioxSessionContext(
  envBase: Record<string, unknown> | undefined,
  client: { domain?: string; translationTerms?: { source: string; target: string }[] },
): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = envBase ? { ...envBase } : {};
  if (client.domain?.trim()) {
    const general = Array.isArray(out.general) ? ([...out.general] as { key?: string; value?: string }[]) : [];
    general.push({ key: 'domain', value: client.domain.trim() });
    out.general = general;
  }
  if (client.translationTerms?.length) {
    const prev = Array.isArray(out.translation_terms) ? ([...out.translation_terms] as unknown[]) : [];
    out.translation_terms = [...prev, ...client.translationTerms];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function resolveOpts(opts: SonioxTranslationSTTOptions): ResolvedSonioxOpts {
  const apiKey = opts.apiKey ?? process.env.SONIOX_API_KEY;
  if (!apiKey) {
    throw new Error('SonioxTranslationSTT requires SONIOX_API_KEY or opts.apiKey');
  }
  const region = parseSonioxRegion();
  const explicitBase = (opts.baseUrl ?? process.env.SONIOX_BASE_URL)?.trim();
  const baseUrl = explicitBase?.length ? explicitBase : defaultSonioxSttWebSocketUrl(region);

  if (explicitBase?.length && process.env.SONIOX_REGION?.trim() && sonioxRegionHostnameMismatch(region, baseUrl)) {
    log().warn(
      { region, baseUrl: baseUrl.replace(/api_key=[^&]+/gi, 'api_key=REDACTED') },
      'SONIOX_BASE_URL hostname may not match SONIOX_REGION — check https://soniox.com/docs/data-residency',
    );
  }

  return {
    apiKey,
    baseUrl,
    sonioxRegion: region,
    model: opts.model ?? process.env.SONIOX_MODEL ?? 'stt-rt-v4',
    languageA: clampSonioxLang(opts.languageA ?? process.env.TRANSLATION_LANGUAGE_A, 'en'),
    languageB: clampSonioxLang(opts.languageB ?? process.env.TRANSLATION_LANGUAGE_B, 'es'),
    languageHints:
      opts.languageHints ??
      [
        clampSonioxLang(opts.languageA ?? process.env.TRANSLATION_LANGUAGE_A, 'en'),
        clampSonioxLang(opts.languageB ?? process.env.TRANSLATION_LANGUAGE_B, 'es'),
      ],
    maxEndpointDelayMs: Math.min(
      3000,
      Math.max(
        500,
        opts.maxEndpointDelayMs ?? Number(process.env.SONIOX_MAX_ENDPOINT_DELAY_MS ?? '700'),
      ),
    ),
    finalizeQuietMs: opts.finalizeQuietMs ?? Number(process.env.TRANSCRIPT_FINALIZE_QUIET_MS ?? '450'),
    sampleRate: opts.sampleRate ?? 16000,
    numChannels: opts.numChannels ?? 1,
    envContextBase: parseEnvSonioxContextBase(),
    clientHintsBox: { hints: {} },
  };
}

export class SonioxTranslationSTT extends stt.STT {
  readonly label = 'soniox.translation.STT';
  #opts: ResolvedSonioxOpts;
  #onBridge?: SonioxBridgeHandler;
  #onFatal?: (message: string) => void;
  #speechStream: SonioxSpeechStream | null = null;

  override get model(): string {
    return this.#opts.model;
  }

  override get provider(): string {
    return 'Soniox';
  }

  constructor(opts: SonioxTranslationSTTOptions = {}) {
    super({
      streaming: true,
      interimResults: true,
      alignedTranscript: false,
    });
    this.#opts = resolveOpts(opts);
    this.#onBridge = opts.onBridge;
    this.#onFatal = opts.onFatal;
  }

  async _recognize(_frame: Parameters<stt.STT['_recognize']>[0]): Promise<stt.SpeechEvent> {
    throw new Error('SonioxTranslationSTT is streaming-only');
  }

  stream(options?: { connOptions?: import('@livekit/agents').APIConnectOptions }): stt.SpeechStream {
    const stream = new SonioxSpeechStream(
      this,
      this.#opts,
      this.#onBridge,
      this.#onFatal,
      options?.connOptions,
    );
    this.#speechStream = stream;
    return stream;
  }

  /** Apply Soniox two-way pair from the mobile client; reconnects an active websocket when needed. */
  applyLanguagePair(languageA: string, languageB: string): boolean {
    const a = languageA.trim().toLowerCase();
    const b = languageB.trim().toLowerCase();
    if (!SONIOX_LANGUAGE_CODES.has(a) || !SONIOX_LANGUAGE_CODES.has(b) || a === b) return false;
    const pairChanged = this.#opts.languageA !== a || this.#opts.languageB !== b;
    this.#opts.languageA = a;
    this.#opts.languageB = b;
    this.#opts.languageHints = [a, b];
    /** Avoid tearing down Soniox on duplicate `voisa.language_pair` republishes (same pair → same start payload). */
    if (pairChanged) this.#speechStream?.forceReconnectSoniox();
    return true;
  }

  /**
   * Optional `voisa.language_pair` fields: `translationDomain` (string), `translationTerms` (array of
   * `{ source, target }`) — merged into Soniox `context` per https://soniox.com/docs/api-reference/stt/websocket-api
   */
  applyClientContextHints(hints: {
    domain?: string;
    translationTerms?: { source: string; target: string }[];
  }): void {
    const box = this.#opts.clientHintsBox;
    const merged = { ...box.hints };
    if (hints.domain !== undefined) {
      const d = hints.domain.trim();
      merged.domain = d.length > 0 ? d : undefined;
    }
    if (hints.translationTerms !== undefined) {
      merged.translationTerms = hints.translationTerms.filter(
        (t) => typeof t.source === 'string' && typeof t.target === 'string' && t.source.trim() && t.target.trim(),
      );
      if (merged.translationTerms.length === 0) delete merged.translationTerms;
    }
    const same = JSON.stringify(box.hints) === JSON.stringify(merged);
    if (same) return;
    box.hints = merged;
    this.#speechStream?.forceReconnectSoniox();
  }

  async close(): Promise<void> {
    /* streams own websocket lifecycle */
  }
}

class SonioxSpeechStream extends stt.SpeechStream {
  #opts: ResolvedSonioxOpts;
  #onBridge?: SonioxBridgeHandler;
  #onFatal?: (message: string) => void;
  #socket: WebSocket | null = null;

  readonly label = 'soniox.translation.SpeechStream';

  /** Backoff that aborts as soon as {@link SpeechStream.close} runs (avoids zombie reconnect loops across jobs). */
  async #sleepBackoff(seconds: number): Promise<void> {
    const ms = Math.round(seconds * 1000);
    await new Promise<void>((resolve, reject) => {
      const sig = this.abortSignal;
      if (sig.aborted) {
        reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        return;
      }
      const id = setTimeout(resolve, ms);
      sig.addEventListener(
        'abort',
        () => {
          clearTimeout(id);
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        },
        { once: true },
      );
    });
  }

  forceReconnectSoniox(): void {
    try {
      const s = this.#socket;
      if (s && s.readyState === WebSocket.OPEN) s.close();
    } catch {
      /* ignore */
    }
  }

  constructor(
    parent: SonioxTranslationSTT,
    opts: ResolvedSonioxOpts,
    onBridge: SonioxBridgeHandler | undefined,
    onFatal: ((message: string) => void) | undefined,
    connOptions?: import('@livekit/agents').APIConnectOptions,
  ) {
    super(parent, opts.sampleRate, connOptions);
    this.#opts = opts;
    this.#onBridge = onBridge;
    this.#onFatal = onFatal;
  }

  override pushFrame(frame: AudioFrame): void {
    if (frame.samplesPerChannel > 0 && frame.channels === 2) {
      const mono = downmixInterleavedStereoS16ToMono(frame.data, frame.samplesPerChannel);
      super.pushFrame(
        new AudioFrame(mono, frame.sampleRate, 1, frame.samplesPerChannel, frame.userdata),
      );
      return;
    }
    super.pushFrame(frame);
  }

  async run(): Promise<void> {
    const maxRetry = 16;
    let retries = 0;
    while (!this.input.closed && !this.closed) {
      if (this.abortSignal.aborted) break;
      try {
        await this.#runOnce();
      } catch (e) {
        if (this.abortSignal.aborted || this.closed || this.input.closed) break;
        if (e instanceof SonioxFatalError) {
          this.#onFatal?.(e.message);
          throw e;
        }
        if (retries >= maxRetry) {
          throw new Error(`Soniox STT failed after ${retries} retries: ${String(e)}`);
        }
        const baseDelay = Math.min(1 + retries * 1.5, 6);
        const tlsExtra = looksLikeTlsHandshakeNoise(e) ? Math.min(2 + retries, 8) : 0;
        const delaySec = Math.min(baseDelay + tlsExtra, 14);
        retries++;
        log().warn({ err: e }, `Soniox reconnect in ${delaySec}s (${retries}/${maxRetry})`);
        try {
          await this.#sleepBackoff(delaySec);
        } catch {
          break;
        }
      }
    }
    this.closed = true;
  }

  async #runOnce(): Promise<void> {
    const ws = new WebSocket(this.#opts.baseUrl, sonioxSttWsOptions());

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
      ws.once('close', () => reject(new Error('Soniox websocket closed before open')));
    });

    /** Tracked ASAP so {@link SonioxSpeechStream.forceReconnectSoniox} can close this socket reliably. */
    this.#socket = ws;

    const persistFinals: SonioxToken[] = [];
    let lastMsgNonFinal: SonioxToken[] = [];
    let lastBridgeKey = '';
    let speaking = false;
    let finalizeTimer: ReturnType<typeof setTimeout> | null = null;

    const cancelFinalize = () => {
      if (finalizeTimer) clearTimeout(finalizeTimer);
      finalizeTimer = null;
    };

    const bumpFinalize = (fn: () => void) => {
      cancelFinalize();
      finalizeTimer = setTimeout(fn, this.#opts.finalizeQuietMs);
    };

    const put = (ev: stt.SpeechEvent) => {
      if (!this.queue.closed) this.queue.put(ev);
    };

    /** Tune vs device/network: lower = snappier UI, higher = fewer `publishData` packets (LiveKit data-channel budget). */
    const BRIDGE_COALESCE_MS = (() => {
      const raw = process.env.VOISA_TRANSCRIPT_BRIDGE_COALESCE_MS?.trim();
      if (!raw) return 55;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n >= 20 && n <= 500 ? n : 55;
    })();
    const debugTranscriptBridge = process.env.VOISA_DEBUG_TRANSCRIPT_BRIDGE?.trim() === '1';
    let bridgeFlushTimer: ReturnType<typeof setTimeout> | null = null;
    let coalescedPartial: Omit<VoisaTranscriptBridgePayload, 'type'> | null = null;

    const emitBridge = (payload: Omit<VoisaTranscriptBridgePayload, 'type'>) => {
      this.#onBridge?.({
        type: 'voisa.transcript',
        ...payload,
      });
    };

    const flushCoalescedPartial = () => {
      bridgeFlushTimer = null;
      if (!coalescedPartial) return;
      const p = coalescedPartial;
      coalescedPartial = null;
      emitBridge(p);
    };

    const bridgePartialCoalesced = (payload: Omit<VoisaTranscriptBridgePayload, 'type'>) => {
      coalescedPartial = payload;
      if (bridgeFlushTimer) clearTimeout(bridgeFlushTimer);
      bridgeFlushTimer = setTimeout(flushCoalescedPartial, BRIDGE_COALESCE_MS);
    };

    const cancelBridgeCoalesce = () => {
      if (bridgeFlushTimer) {
        clearTimeout(bridgeFlushTimer);
        bridgeFlushTimer = null;
      }
      coalescedPartial = null;
    };

    const bridge = (payload: Omit<VoisaTranscriptBridgePayload, 'type'>) => {
      emitBridge(payload);
    };

    const flushUtterance = () => {
      cancelFinalize();
      cancelBridgeCoalesce();
      const merged = [...persistFinals, ...lastMsgNonFinal];
      const spoken = sanitizeSonioxStreamText(concatSpoken(merged));
      const translated = sanitizeSonioxStreamText(concatTranslated(merged));
      if (!spoken && !translated) return;

      const detected = detectLanguage(merged);
      const lang: LanguageCode = normalizeLanguage(detected ?? this.#opts.languageA);
      const pipelineText = translated || spoken;

      bridge({
        original: spoken,
        /** Mobile “translation” line must never duplicate mic/source text; Soniox `translation` may be empty briefly. */
        translated,
        detectedLanguage: detected,
        isFinal: true,
      });
      put({
        type: stt.SpeechEventType.FINAL_TRANSCRIPT,
        alternatives: [
          {
            language: lang,
            text: pipelineText,
            startTime: 0,
            endTime: 0,
            confidence: 0.92,
            sourceLanguages: detected ? [normalizeLanguage(detected)] : undefined,
          },
        ],
      });
      put({ type: stt.SpeechEventType.END_OF_SPEECH });
      persistFinals.length = 0;
      lastMsgNonFinal = [];
      lastBridgeKey = '';
      speaking = false;
    };

    /**
     * ~20ms PCM chunks — forwards mic audio sooner than LiveKit’s default ~100ms AudioByteStream buffer.
     * Matches Soniox guidance to stream near real-time cadence (avoid long stalls / huge bursts — https://soniox.com/docs/stt/rt/error-handling).
     * Soniox may return 408 “Audio data decode timeout” if no PCM arrives shortly after session start.
     */
    const samplesPerChunk = Math.max(Math.floor(this.#opts.sampleRate / 50), 1);

    const listenPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };

      ws.once('close', () => {
        settle(() => reject(new Error('Soniox websocket closed')));
      });

      ws.on('message', (raw) => {
        let res: SonioxResponse;
        try {
          res = JSON.parse(raw.toString()) as SonioxResponse;
        } catch (err) {
          settle(() => reject(err instanceof Error ? err : new Error(String(err))));
          return;
        }

        /** Soniox sends `{ error_code, error_message }` JSON, then closes — https://soniox.com/docs/stt/rt/error-handling */
        if (res.error_code !== undefined) {
          const code = res.error_code;
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          const detail = res.error_message ?? '';
          const msg = `Soniox error ${code}: ${detail}`;
          log().error({ sonioxErrorCode: code, sonioxErrorMessage: detail }, msg);
          if (SONIOX_NONRETRY_CODES.has(code)) {
            settle(() => reject(new SonioxFatalError(code, msg)));
          } else {
            settle(() => reject(new Error(msg)));
          }
          return;
        }

        const msgNonFinal: SonioxToken[] = [];
        const tokens = res.tokens ?? [];
        /** Soniox emits this after semantic endpointing — finalize utterance immediately (vs only TRANSCRIPT_FINALIZE_QUIET_MS). */
        let endpointMarkerThisResponse = false;
        for (const token of tokens) {
          if (!token.text) continue;
          if (isSonioxUtteranceEndMarker(token)) {
            endpointMarkerThisResponse = true;
            continue;
          }
          if (token.is_final) {
            if (!persistFinalsHasDuplicate(persistFinals, token)) {
              persistFinals.push(token);
              trimPersistFinals(persistFinals);
            }
          } else {
            msgNonFinal.push(token);
          }
        }

        lastMsgNonFinal = msgNonFinal;

        const spokenDraft = sanitizeSonioxStreamText(
          concatSpoken([...persistFinals, ...msgNonFinal]),
        );
        const translationDraft = sanitizeSonioxStreamText(
          concatTranslated([...persistFinals, ...msgNonFinal]),
        );

        /**
         * Token cadence per Soniox RT docs: non-finals belong to **this** response only; finals accumulate.
         * Translated chunks often trail originals — apps should still **render originals immediately** while
         * translation catches up (`https://soniox.com/docs/stt/rt/real-time-translation`).
         * We forward every draft change over `voisa.transcript`; the Expo UI treats empty translation as partial.
         */
        const bridgeKey = `${spokenDraft}\0${translationDraft}`;
        if (bridgeKey !== lastBridgeKey) {
          lastBridgeKey = bridgeKey;
          const detectedLive = detectLanguage([...persistFinals, ...msgNonFinal]);
          const langLive: LanguageCode = normalizeLanguage(detectedLive ?? this.#opts.languageA);

          /** Pipeline + TTS: prefer translated text when Soniox has it, else spoken. */
          const pipelineDraft = translationDraft || spokenDraft;
          /**
           * LiveKit `UserInputTranscribed` → `lk.transcription` uses this string. Prefer **spoken** so the
           * standard text stream matches “what the user said”; translation still streams via `voisa.transcript`.
           */
          const lkCaptionDraft =
            spokenDraft.length > 0 ? spokenDraft : translationDraft;

          if (!speaking && pipelineDraft.length > 0) {
            speaking = true;
            put({
              type: stt.SpeechEventType.START_OF_SPEECH,
            });
          }

          if (spokenDraft.length > 0 || translationDraft.length > 0) {
            if (debugTranscriptBridge) {
              log().debug(
                {
                  originalLen: spokenDraft.length,
                  translatedLen: translationDraft.length,
                  originalTail: spokenDraft.slice(-32),
                  translatedTail: translationDraft.slice(-32),
                },
                'voisa.transcript partial bridge',
              );
            }
            bridgePartialCoalesced({
              original: spokenDraft,
              translated: translationDraft,
              detectedLanguage: detectedLive,
              isFinal: false,
            });
          }

          put({
            type: stt.SpeechEventType.INTERIM_TRANSCRIPT,
            alternatives: [
              {
                language: langLive,
                text: lkCaptionDraft,
                startTime: 0,
                endTime: 0,
                confidence: 0.85,
                sourceLanguages: detectedLive ? [normalizeLanguage(detectedLive)] : undefined,
              },
            ],
          });

          bumpFinalize(() => flushUtterance());
        }

        if (endpointMarkerThisResponse) {
          cancelFinalize();
          flushUtterance();
        }

        if (res.finished) {
          flushUtterance();
          settle(() => resolve());
        }
      });
    });

    /**
     * Build immediately before {@link ws.send}: `voisa.language_pair` may update `this.#opts` mid-`#runOnce`
     * (after websocket open listeners are wired). A snapshot earlier would permanently lock `language_a`/`b` to stale values.
     */
    const startPayload: Record<string, unknown> = {
      api_key: this.#opts.apiKey,
      model: this.#opts.model,
      audio_format: 'pcm_s16le',
      sample_rate: this.#opts.sampleRate,
      num_channels: this.#opts.numChannels,
      language_hints: this.#opts.languageHints,
      enable_speaker_diarization: false,
      /** Soniox recommends this for translation streams so tokens carry accurate `language` / pairing metadata. */
      enable_language_identification: true,
      enable_endpoint_detection: true,
      max_endpoint_delay_ms: this.#opts.maxEndpointDelayMs,
      translation: {
        type: 'two_way',
        language_a: this.#opts.languageA,
        language_b: this.#opts.languageB,
      },
    };

    const ctxMerged = mergeSonioxSessionContext(this.#opts.envContextBase, this.#opts.clientHintsBox.hints);
    if (ctxMerged) startPayload.context = ctxMerged;

    ws.send(JSON.stringify(startPayload));

    /** Keep decoder fed until participant audio arrives (WebRTC subscribe / mic path can lag session start). */
    try {
      const silenceBytes = samplesPerChunk * this.#opts.numChannels * 2;
      const silenceChunk = Buffer.alloc(silenceBytes);
      for (let i = 0; i < 75; i++) {
        ws.send(silenceChunk);
      }
    } catch {
      /* ignore */
    }

    /** JSON control frames — cheap insurance when mic/VAD yields sparse PCM chunks. */
    const keepaliveTimer = setInterval(() => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'keepalive' }));
        }
      } catch {
        /* ignore */
      }
    }, SONIOX_KEEPALIVE_INTERVAL_MS);

    const sendTask = async () => {
      const byteStream = new AudioByteStream(
        this.#opts.sampleRate,
        this.#opts.numChannels,
        samplesPerChunk,
      );
      const abortPromise = waitForAbort(this.abortSignal);
      try {
        while (true) {
          const result = await Promise.race([this.input.next(), abortPromise]);
          if (result === undefined) return;
          if (result.done) break;
          const data = result.value;
          let frames: AudioFrame[];
          if (data === stt.SpeechStream.FLUSH_SENTINEL) {
            frames = byteStream.flush();
          } else if (data.sampleRate === this.#opts.sampleRate && data.channels === this.#opts.numChannels) {
            frames = byteStream.write(data.data.buffer);
          } else {
            throw new Error('Unexpected audio frame shape for Soniox (expected 16kHz mono)');
          }
          for (const frame of frames) {
            ws.send(Buffer.from(frame.data.buffer));
          }
        }
      } finally {
        /** Manual finalization — flush pending tokens before EOS; https://soniox.com/docs/stt/rt/real-time-transcription#getting-final-tokens-sooner */
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'finalize' }));
          }
        } catch {
          /* ignore */
        }
        try {
          ws.send(Buffer.alloc(0));
        } catch {
          /* ignore */
        }
      }
    };

    try {
      await Promise.all([sendTask(), listenPromise]);
    } finally {
      clearInterval(keepaliveTimer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      if (this.#socket === ws) this.#socket = null;
    }
  }
}
