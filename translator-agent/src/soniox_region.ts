/**
 * Regional Soniox realtime hosts — https://soniox.com/docs/data-residency#regional-endpoints
 * Use `SONIOX_REGION` when `SONIOX_BASE_URL` / `SONIOX_TTS_WS_URL` are unset.
 */
export type SonioxRegion = 'us' | 'eu' | 'jp';

const STT_PATH = '/transcribe-websocket';
const TTS_PATH = '/tts-websocket';

const REGION_DEFAULTS: Record<SonioxRegion, { sttHost: string; ttsHost: string }> = {
  us: { sttHost: 'stt-rt.soniox.com', ttsHost: 'tts-rt.soniox.com' },
  eu: { sttHost: 'stt-rt.eu.soniox.com', ttsHost: 'tts-rt.eu.soniox.com' },
  jp: { sttHost: 'stt-rt.jp.soniox.com', ttsHost: 'tts-rt.jp.soniox.com' },
};

export function parseSonioxRegion(): SonioxRegion {
  const raw = process.env.SONIOX_REGION?.trim().toLowerCase();
  if (raw === 'eu' || raw === 'jp' || raw === 'us') return raw;
  return 'us';
}

export function defaultSonioxSttWebSocketUrl(region: SonioxRegion = parseSonioxRegion()): string {
  return `wss://${REGION_DEFAULTS[region].sttHost}${STT_PATH}`;
}

export function defaultSonioxTtsWebSocketUrl(region: SonioxRegion = parseSonioxRegion()): string {
  return `wss://${REGION_DEFAULTS[region].ttsHost}${TTS_PATH}`;
}

/** Heuristic: warn if explicit URL hostname does not match chosen region preset. */
export function sonioxRegionHostnameMismatch(region: SonioxRegion, wssUrl: string): boolean {
  try {
    const u = new URL(wssUrl);
    const host = u.hostname.toLowerCase();
    const expected = REGION_DEFAULTS[region].sttHost;
    if (host === expected) return false;
    if (region === 'us' && (host.includes('.eu.') || host.includes('.jp.'))) return true;
    if (region === 'eu' && !host.includes('.eu.') && host.includes('soniox.com')) return true;
    if (region === 'jp' && !host.includes('.jp.') && host.includes('soniox.com')) return true;
    return false;
  } catch {
    return false;
  }
}

export function sonioxTtsRegionHostnameMismatch(region: SonioxRegion, wssUrl: string): boolean {
  try {
    const u = new URL(wssUrl);
    const host = u.hostname.toLowerCase();
    const expected = REGION_DEFAULTS[region].ttsHost;
    if (host === expected) return false;
    if (region === 'us' && (host.includes('.eu.') || host.includes('.jp.'))) return true;
    if (region === 'eu' && !host.includes('.eu.') && host.includes('soniox.com')) return true;
    if (region === 'jp' && !host.includes('.jp.') && host.includes('soniox.com')) return true;
    return false;
  } catch {
    return false;
  }
}
