import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

import { assertSupabaseConfigured, supabasePublishableKey, supabaseUrl } from '@/lib/config';

assertSupabaseConfigured();

const secureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl!, supabasePublishableKey!, {
  auth: {
    storage: secureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
