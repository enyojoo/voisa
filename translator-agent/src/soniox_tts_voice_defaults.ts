/**
 * When callers do not pin `SONIOX_TTS_VOICE`, pick a curated Soniox Studio voice by output language.
 * Any voice may speak any language per Soniox; these names align with advertised regional styles where available.
 * @see https://soniox.com/docs/tts/concepts/voices
 */
export function defaultSonioxVoiceForLanguage(iso639_1: string): string {
  const c = iso639_1.trim().toLowerCase();
  const m: Record<string, string> = {
    /** Spanish-accent catalog voices */
    es: 'Rafael',
    /** Hindi-accent catalog voices */
    hi: 'Priya',
    /** East Asian presets */
    ja: 'Kenji',
    zh: 'Kenji',
    ko: 'Mina',
    /** European multilingual-friendly */
    ru: 'Maya',
    uk: 'Maya',
    de: 'Daniel',
    fr: 'Emma',
    it: 'Nina',
    pt: 'Claire',
    pl: 'Claire',
    nl: 'Owen',
    tr: 'Noah',
    ar: 'Daniel',
  };
  return m[c] ?? 'Adrian';
}
