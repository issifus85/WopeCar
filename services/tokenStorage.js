// LEGACY - kept for now in case anything still references it, but nothing
// in contexts/AuthContext.js calls into this file anymore. Auth moved to
// Supabase (services/supabaseAuthApi.js, contexts/AuthContext.js) - token
// management is now handled internally by the Supabase client
// (services/supabase.js's own storage adapter, a *different* SecureStore/
// localStorage key than the one below). This file's `wopecar_auth_token`
// key was the Laravel Sanctum bearer token specifically; with the Laravel
// backend being retired, nothing should be writing to it going forward.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'wopecar_auth_token';

export async function getToken() {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_KEY) : null;
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.setItem(TOKEN_KEY, token);
    return;
  }
  return SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken() {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.removeItem(TOKEN_KEY);
    return;
  }
  return SecureStore.deleteItemAsync(TOKEN_KEY);
}
