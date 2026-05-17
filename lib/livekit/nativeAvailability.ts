import Constants, { ExecutionEnvironment } from 'expo-constants';
import { NativeModules } from 'react-native';

/**
 * `@livekit/react-native-webrtc` only treats `WebRTCModule === null` as missing; `undefined`
 * slips through and crashes later (`NativeEventEmitter`). Gate all native LiveKit loads on this.
 */
export function canUseLiveKitWebRTC(): boolean {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return false;
  }
  const m = NativeModules.WebRTCModule as object | null | undefined;
  return m != null && typeof m === 'object';
}
