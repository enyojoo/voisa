import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme/tokens';
import { useAuth } from '@/providers/AuthProvider';

export default function SignInScreen() {
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter email and password');
      return;
    }
    setBusy(true);
    const { error: e } = await signInWithEmail(email, password);
    setBusy(false);
    if (e) setError(e.message);
    else router.replace('/translate');
  };

  const onGoogle = async () => {
    setError(null);
    setBusy(true);
    const { error: e } = await signInWithGoogle();
    setBusy(false);
    if (e) setError(e.message);
    else router.replace('/translate');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Voisa</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.primaryBtn} onPress={onSubmit} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Sign in</Text>}
          </Pressable>
          <Pressable style={styles.googleBtn} onPress={onGoogle} disabled={busy}>
            <Text style={styles.googleText}>Continue with Google</Text>
          </Pressable>
          <Link href="/sign-up" asChild>
            <Pressable style={styles.linkWrap}>
              <Text style={styles.link}>Create an account</Text>
            </Pressable>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  card: { gap: spacing.md },
  title: { fontSize: 32, fontWeight: '700', color: colors.primary },
  subtitle: { fontSize: 16, color: colors.textSecondary, marginBottom: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#fff',
  },
  error: { color: colors.danger, fontSize: 14 },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  googleBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  googleText: { color: colors.text, fontSize: 16, fontWeight: '500' },
  linkWrap: { alignItems: 'center', marginTop: spacing.md },
  link: { color: colors.primary, fontSize: 15 },
});
