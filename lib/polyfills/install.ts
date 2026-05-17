/**
 * Hermes does not ship `DOMException`; `livekit-client` assumes browser globals during import.
 * Install before any `livekit-client` dependency loads (see root `app/_layout.tsx`).
 */
if (typeof globalThis.DOMException === 'undefined') {
  globalThis.DOMException = class DOMExceptionPolyfill extends Error {
    constructor(message = '', name = 'Error') {
      super(typeof message === 'string' ? message : String(message));
      this.name = name;
      Object.setPrototypeOf(this, DOMExceptionPolyfill.prototype);
    }
  } as unknown as typeof DOMException;
}

/** RN/Hermes often omit global `EventTarget`; livekit-client touches `EventTarget.prototype` during import. */
if (typeof globalThis.EventTarget === 'undefined') {
  class EventTargetPolyfill {
    addEventListener(): void {}
    removeEventListener(): void {}
    dispatchEvent(): boolean {
      return true;
    }
  }
  globalThis.EventTarget = EventTargetPolyfill as unknown as typeof EventTarget;
}

/**
 * React Native defines `navigator` but often omits `userAgent`. `livekit-client` calls
 * `(navigator.userAgent).toLowerCase()` (see `getBrowser`), which crashes during mic publish / startAudio.
 * Use a Chrome desktop UA so we skip startAudio's iOS branch that touches `document.*` (no DOM in RN).
 */
const nav = globalThis.navigator as Navigator | undefined;
if (nav && (typeof nav.userAgent !== 'string' || nav.userAgent.trim() === '')) {
  Object.defineProperty(nav, 'userAgent', {
    value:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    configurable: true,
    enumerable: true,
    writable: true,
  });
}

/**
 * `livekit-client`'s webrtc adapter picks the **Safari** shim when `webkitGetUserMedia` is missing but the UA
 * contains `AppleWebKit` — which breaks RN (`_remoteStreams` is a Map; Safari shim expects an array).
 * Delegating `webkitGetUserMedia` → `mediaDevices.getUserMedia` forces the **Chrome** shim path instead.
 */
type LegacyConstraints = MediaStreamConstraints;
const navLegacy = nav as
  | (Navigator & {
      webkitGetUserMedia?: (
        constraints: LegacyConstraints,
        success: (stream: MediaStream) => void,
        failure: (err: DOMException) => void,
      ) => void;
    })
  | undefined;

if (
  navLegacy &&
  typeof navLegacy.webkitGetUserMedia !== 'function' &&
  typeof navLegacy.mediaDevices?.getUserMedia === 'function'
) {
  const mdGet = navLegacy.mediaDevices.getUserMedia.bind(navLegacy.mediaDevices);
  navLegacy.webkitGetUserMedia = (constraints, success, failure) => {
    void mdGet(constraints).then(success).catch(failure);
  };
}
