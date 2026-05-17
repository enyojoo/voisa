import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UserAvatarBubble, userDisplayName } from '@/components/AppHeader';
import { useAuth } from '@/providers/AuthProvider';
import { useTranslatorLifecycle } from '@/providers/TranslatorLifecycleProvider';
import { colors, spacing } from '@/theme/tokens';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { stopTranslatorSession } = useTranslatorLifecycle();

  const displayName = user ? userDisplayName(user) : 'Guest';
  const email = user?.email?.trim() ?? '';

  const onAbout = () => {
    const version = Constants.expoConfig?.version ?? '—';
    Alert.alert(
      'About Voisa',
      `Real-time voice interpretation.\n\nVersion ${version}`,
      [{ text: 'OK' }],
    );
  };

  const onFeedback = () => {
    const subject = encodeURIComponent('Voisa feedback');
    void Linking.openURL(`mailto:feedback@voisa.app?subject=${subject}`);
  };

  const onHelp = () => {
    void Linking.openURL('https://voisa.app/help');
  };

  const onLogOut = () => {
    Alert.alert(
      'Sign out?',
      'You will leave Voisa on this device. Any active interpretation session will stop.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await stopTranslatorSession();
            await signOut();
            router.replace('/sign-in');
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={14}
          style={styles.iconHit}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>Account</Text>
        <View style={styles.iconHit} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <UserAvatarBubble size={88} />
          <Text style={styles.name}>{displayName}</Text>
          {email ? <Text style={styles.email}>{email}</Text> : null}
        </View>

        <Text style={styles.sectionLabel}>Support</Text>
        <View style={styles.card}>
          <MenuRow icon="information-circle-outline" label="About" onPress={onAbout} />
          <MenuRow icon="chatbubble-outline" label="Feedback" onPress={onFeedback} />
          <MenuRow icon="help-circle-outline" label="Help" onPress={onHelp} last />
        </View>

        <Pressable style={styles.logoutBtn} onPress={onLogOut} accessibilityRole="button">
          <Ionicons name="log-out-outline" size={22} color={colors.danger} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
  last,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.menuRow, !last && styles.menuRowBorder]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={22} color={colors.textSecondary} />
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  email: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  menuRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuLabel: {
    flex: 1,
    fontSize: 17,
    color: colors.text,
    fontWeight: '500',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${colors.danger}44`,
    backgroundColor: `${colors.danger}08`,
  },
  logoutText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.danger,
  },
});
