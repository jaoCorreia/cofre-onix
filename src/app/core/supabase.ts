import { Capacitor } from '@capacitor/core';
import { createClient, SupportedStorage } from '@supabase/supabase-js';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { environment } from '../../environments/environment';

/** No celular a sessão fica no Keystore (Android) / Keychain (iOS), nunca em localStorage. */
const nativeStorage: SupportedStorage = {
  getItem: (key) => SecureStorage.getItem(key),
  setItem: (key, value) => SecureStorage.setItem(key, value),
  removeItem: (key) => SecureStorage.removeItem(key),
};

export const isNative = Capacitor.isNativePlatform();

export const supabase = createClient(environment.supabase.url, environment.supabase.anonKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: !isNative,
    storage: isNative ? nativeStorage : undefined,
  },
});
