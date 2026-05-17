/**
 * `livekit-client` bundles adapter `shimRemoteStreamsAPI` for Safari: it wraps `setRemoteDescription`
 * and assumes `pc._remoteStreams` is an **array** (`indexOf`). `@livekit/react-native-webrtc` keeps
 * `_remoteStreams` as a **Map**, so that shim throws at runtime.
 *
 * The shim only installs when **`'onaddstream' in RTCPeerConnection.prototype`** is false.
 * RN WebRTC uses `ontrack` only — so we define a minimal legacy `onaddstream` accessor on the prototype
 * **before** `livekit-client` is imported (see `app/_layout.tsx` bootstrap order).
 */
export function ensureRtcPeerConnectionLegacyCompat(): void {
  const RTCPC = globalThis.RTCPeerConnection;
  if (!RTCPC?.prototype) return;

  const proto = RTCPC.prototype as RTCPeerConnection & Record<string, unknown>;

  if (Object.prototype.hasOwnProperty.call(proto, 'onaddstream')) {
    return;
  }

  Object.defineProperty(proto, 'onaddstream', {
    configurable: true,
    enumerable: true,
    get(this: RTCPeerConnection) {
      const bag = this as unknown as { _voisaOnAddStream?: typeof proto.onaddstream };
      return bag._voisaOnAddStream ?? null;
    },
    set(this: RTCPeerConnection, handler: typeof proto.onaddstream | null) {
      const bag = this as unknown as {
        _voisaOnAddStream?: typeof proto.onaddstream;
      };
      const prev = bag._voisaOnAddStream;
      if (prev) {
        this.removeEventListener('addstream', prev as unknown as EventListener);
      }
      bag._voisaOnAddStream = handler ?? undefined;
      if (handler) {
        this.addEventListener('addstream', handler as unknown as EventListener);
      }
    },
  });
}
