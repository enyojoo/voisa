import type { User } from '@supabase/supabase-js';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/providers/AuthProvider';
import { colors, spacing } from '@/theme/tokens';

export function userDisplayName(user: User | null): string {
  if (!user) return 'Guest';
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const full = typeof meta?.full_name === 'string' ? meta.full_name.trim() : '';
  if (full) return full;
  const email = user.email?.trim();
  if (email) return email.split('@')[0] ?? 'User';
  return 'User';
}

function initialsFromUser(user: User | null): string {
  const label = userDisplayName(user);
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]?.[0];
    const b = parts[1]?.[0];
    if (a && b) return `${a}${b}`.toUpperCase();
  }
  return label.slice(0, 2).toUpperCase() || '?';
}

function avatarUri(user: User | null): string | null {
  if (!user) return null;
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const u =
    typeof meta?.avatar_url === 'string'
      ? meta.avatar_url
      : typeof meta?.picture === 'string'
        ? meta.picture
        : null;
  return u?.trim() || null;
}

export function UserAvatarBubble({ size = 40 }: { size?: number }) {
  const { user } = useAuth();
  const uri = avatarUri(user);
  const initials = initialsFromUser(user);

  return (
    <View
      style={[
        styles.avatarOuter,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
      accessibilityIgnoresInvertColors
    >
      {uri ? (
        <Image source={{ uri }} style={[styles.avatarImage, { borderRadius: size / 2 }]} />
      ) : (
        <Text style={[styles.avatarInitials, { fontSize: size * 0.36 }]}>{initials}</Text>
      )}
    </View>
  );
}

/** Translate home chrome: Voisa + profile avatar. */
export function AppHeader() {
  const router = useRouter();

  return (
    <View style={styles.row}>
      <Text style={styles.brand} accessibilityRole="header">
        Voisa
      </Text>
      <Pressable
        onPress={() => router.push('/profile')}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Account and settings"
      >
        <UserAvatarBubble size={40} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 48,
  },
  brand: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.navy,
    letterSpacing: -0.5,
  },
  avatarOuter: {
    backgroundColor: `${colors.primary}18`,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryRing,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -0.5,
  },
});
