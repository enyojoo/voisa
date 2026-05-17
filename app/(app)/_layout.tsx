import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/providers/AuthProvider';
import { TranslatorLifecycleProvider } from '@/providers/TranslatorLifecycleProvider';

function AppStack() {
  const { session, loading } = useAuth();
  if (loading) {
    return null;
  }
  if (!session) {
    return <Redirect href="/sign-in" />;
  }
  return (
    <TranslatorLifecycleProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="translate" />
        <Stack.Screen name="profile" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </TranslatorLifecycleProvider>
  );
}

export default function AppGroupLayout() {
  return <AppStack />;
}
