import { lazy, Suspense } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { canUseLiveKitWebRTC } from '@/lib/livekit/nativeAvailability';
import { colors, spacing } from '@/theme/tokens';

const TranslateImpl = lazy(() => import('@/screens/TranslateImplScreen'));

function DevBuildTranslateNotice() {
  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader />
      <View style={styles.body}>
        <Text style={styles.title}>Development build required</Text>
        <Text style={styles.para}>
          LiveKit needs native WebRTC. Use an Expo development build (not Expo Go) with iOS/Android
          pods installed (`npx expo prebuild`, then `pod install`). Open this screen again from that
          build.
        </Text>
      </View>
    </SafeAreaView>
  );
}

export default function TranslateScreen() {
  if (!canUseLiveKitWebRTC()) {
    return <DevBuildTranslateNotice />;
  }
  return (
    <Suspense
      fallback={
        <SafeAreaView style={styles.safe}>
          <View style={styles.fallback}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </SafeAreaView>
      }
    >
      <TranslateImpl />
    </Suspense>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: spacing.md },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  para: { fontSize: 15, lineHeight: 22, color: colors.textSecondary },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
