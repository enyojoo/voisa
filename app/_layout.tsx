import '@/lib/polyfills/install';

import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { configureVoisaRuntimeLogging } from '@/lib/logging/configureClientLogging';
import { ensureRtcPeerConnectionLegacyCompat } from '@/lib/polyfills/livekitRtcCompat';
import { canUseLiveKitWebRTC } from '@/lib/livekit/nativeAvailability';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

/**
 * Must run **before** any `livekit-client` import (Translate screen). Deferred registration previously let
 * adapter Safari shim install and conflict with RN `_remoteStreams` (Map vs Array).
 */
function bootstrapLiveKitWebRtc(): void {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return;
  }
  if (!canUseLiveKitWebRTC()) {
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lkWebRtc = require('@livekit/react-native-webrtc') as {
      registerGlobals?: () => void;
    };
    lkWebRtc.registerGlobals?.();
    ensureRtcPeerConnectionLegacyCompat();
  } catch (e) {
    console.warn('[LiveKit] bootstrap failed — reinstall pods / dev build.', e);
  }
}

bootstrapLiveKitWebRtc();
configureVoisaRuntimeLogging();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <SplashGate />
    </AuthProvider>
  );
}

function SplashGate() {
  const { loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      void SplashScreen.hideAsync();
    }
  }, [loading]);

  if (loading) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </ThemeProvider>
  );
}
