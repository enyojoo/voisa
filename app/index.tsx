import { Redirect } from 'expo-router';

import { useAuth } from '@/providers/AuthProvider';

export default function Index() {
  const { session, loading } = useAuth();
  if (loading) {
    return null;
  }
  if (session) {
    return <Redirect href="/translate" />;
  }
  return <Redirect href="/sign-in" />;
}
