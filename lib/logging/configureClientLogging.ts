import { LogLevel, setLogLevel } from 'livekit-client';

/**
 * Metro noise control:
 * - `@livekit/react-native-webrtc` enables `debug('rn-webrtc:*')` at import time → very chatty colored `pc:DEBUG` lines.
 * - `livekit-client` defaults to `info` → logs every ICE/state/publish line.
 *
 * Opt into verbosity with `EXPO_PUBLIC_VOISA_VERBOSE_LK=1` (Expo public env is inlined at bundle time).
 */
export function configureVoisaRuntimeLogging(): void {
  const verbose =
    typeof process !== 'undefined' &&
    typeof process.env?.EXPO_PUBLIC_VOISA_VERBOSE_LK === 'string' &&
    process.env.EXPO_PUBLIC_VOISA_VERBOSE_LK === '1';

  try {
    setLogLevel(verbose ? LogLevel.info : LogLevel.warn);
  } catch {
    /* livekit-client not loaded yet — ignore */
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbg = require('debug') as { disable: () => void; enable: (ns: string) => void };
    /** Reset in case a lazy-loaded chunk re-imports webrtc and calls `Logger.enable('rn-webrtc:*')` again. */
    dbg.disable();
    /**
     * Verbose: full `rn-webrtc:*` (ICE, pc, etc.).
     * Default: leave `debug` namespaces empty after `disable()` — the prior `rn-webrtc:*,-rn-webrtc:*:DEBUG` filter
     * did not suppress `rn-webrtc:pc` (PeerConnection) because that is not a `*:DEBUG` sub-namespace match.
     */
    if (verbose) {
      dbg.enable('rn-webrtc:*');
    }
  } catch {
    /* ignore */
  }
}
