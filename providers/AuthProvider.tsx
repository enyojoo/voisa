import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithEmail: (
    name: string,
    email: string,
    password: string,
  ) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return { error: error ? new Error(error.message) : null };
  }, []);

  const signUpWithEmail = useCallback(async (name: string, email: string, password: string) => {
    const displayName = name.trim();
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: displayName },
      },
    });
    return { error: error ? new Error(error.message) : null };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const redirectTo = Linking.createURL('/');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: Platform.OS !== 'web',
      },
    });
    if (error) return { error: new Error(error.message) };
    if (!data.url) return { error: new Error('Missing OAuth URL') };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = data.url;
      return { error: null };
    }
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !result.url) {
      return { error: new Error('Google sign-in was cancelled') };
    }
    const url = new URL(result.url);
    const params = new URLSearchParams(url.hash.replace(/^#/, ''));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) {
      return { error: new Error('Could not parse tokens from redirect') };
    }
    const { error: sessionError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    return { error: sessionError ? new Error(sessionError.message) : null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signOut,
    }),
    [session, loading, signInWithEmail, signUpWithEmail, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
