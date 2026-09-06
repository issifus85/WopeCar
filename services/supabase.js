// Supabase JS relies on the WHATWG URL API, which Hermes (this app's JS
// engine, per app.json) doesn't fully implement - this polyfill is required
// for the client to work on native, not just a nice-to-have.
import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';

// Wopecar-preprod - the ongoing dev/test project every build profile except
// `production` (EAS eas.json) points at, per this repo's permanent
// key-separation policy: preprod always carries test/sandbox integration
// keys, production always carries live ones.
const PREPROD_URL = 'https://qvactycnufaowwsiqdrz.supabase.co';
const PREPROD_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2YWN0eWNudWZhb3d3c2lxZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNjkwMDcsImV4cCI6MjEwMDg0NTAwN30.VRzansMc5kimTQKjUWZbodwRjYfJsQDRwLm24UR1VtM';

// wopecar-production - the real live project, launched 2026-09-05. Only the
// `production` EAS build profile (which sets extra.APP_ENV via
// app.config.js) should ever talk to this.
const PRODUCTION_URL = 'https://tndkuzxaddrwrunhbrap.supabase.co';
const PRODUCTION_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZGt1enhhZGRyd3J1bmhicmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4Nzc3MjMsImV4cCI6MjEwMzQ1MzcyM30.Xy9eNlzGSiB-DcjHUFhLDCEQMmdViEbIuSSck4hA3U8';

const isProductionBuild = Constants.expoConfig?.extra?.APP_ENV === 'production';

// Named exports (not just the default client) so other service files that
// need a throwaway second client - e.g. supabaseAuthApi.js's password
// re-verification, which must never touch the real signed-in session -
// don't hardcode these a second time.
export const SUPABASE_URL = isProductionBuild ? PRODUCTION_URL : PREPROD_URL;
// Public by design - Supabase's security model is anon key + Row Level
// Security policies, not a secret key. The service_role key (which bypasses
// RLS) must never appear here or anywhere else client-side.
export const SUPABASE_ANON_KEY = isProductionBuild ? PRODUCTION_ANON_KEY : PREPROD_ANON_KEY;

// Same web-localStorage / native-SecureStore split already used by
// services/tokenStorage.js for the Laravel auth token - kept consistent
// rather than pulling in a separate AsyncStorage dependency.
//
// Known constraint to revisit once real Supabase Auth sessions are used:
// SecureStore enforces a ~2KB per-item limit on iOS Keychain, and a
// persisted Supabase session (access token + refresh token + user object)
// can exceed that. Not an issue yet since nothing calls supabase.auth
// to sign a user in - flagging here so it isn't a surprise later.
const supabaseStorage = {
  getItem: (key) => {
    if (Platform.OS === 'web') {
      return Promise.resolve(typeof window !== 'undefined' ? window.localStorage.getItem(key) : null);
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: (key, value) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
      return Promise.resolve();
    }
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.localStorage.removeItem(key);
      return Promise.resolve();
    }
    return SecureStore.deleteItemAsync(key);
  },
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: supabaseStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Only meaningful on web (OAuth redirect callbacks land in the URL) -
    // there's no such thing as "the URL" on native.
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// Required for React Native per Supabase's own docs
// (https://supabase.com/docs/reference/javascript/initializing#reactnative-example):
// autoRefreshToken's timer is a plain JS setTimeout/setInterval, which the OS
// suspends while the app is backgrounded (e.g. while the user is off in the
// native image picker choosing a license photo mid-checkout). Left
// unwired, a session that expires during that gap doesn't get refreshed
// until *something* happens to nudge it - in practice, whatever request
// runs right after the app comes back to the foreground (e.g. paystack-
// initialize, right as the user taps Pay) hits Supabase with a stale token
// and gets rejected as unauthenticated. Calling startAutoRefresh() on
// resume forces an immediate refresh check instead of waiting on the timer.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

export default supabase;

// Supabase JS returns { data, error } rather than throwing - these helpers
// throw instead, to match every other service file in this app (see
// ApiError in services/api.js), so callers use the same try/catch shape
// regardless of which backend a given call happens to hit.

// No active session is a normal, expected state (not signed in yet) - only
// an unexpected error should propagate as a throw.
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error && error.name !== 'AuthSessionMissingError') throw error;
  return data?.user ?? null;
}

// maybeSingle() (not single()) so a profile that hasn't been provisioned
// yet - see the users-table INSERT-policy gap noted in
// supabase/migrations/0002_rls_policies.sql - returns null instead of
// throwing a "no rows" error.
export async function getUserProfile(id) {
  const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// Returns the raw value (already unwrapped from the row), matching "fetches
// a single value ... by key" - null if the key doesn't exist rather than
// throwing, so callers can apply their own fallback default.
export async function getAppSetting(key) {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

/**
 * supabase.functions.invoke()'s error for a non-2xx response is a
 * FunctionsHttpError whose .message is hardcoded to the generic
 * "Edge Function returned a non-2xx status code" - the Edge Function's own
 * {error: "..."} JSON body (the actually useful part) is only reachable via
 * error.context, the raw Response object. Callers doing `if (error) throw
 * error` were surfacing that generic text to users with no way to tell
 * "session expired" from "not authorized" from a real server bug. Use this
 * instead of throwing `error` directly wherever functions.invoke()'s result
 * is shown to a user.
 */
export async function edgeFunctionErrorMessage(error) {
  try {
    const body = await error?.context?.json();
    if (body?.error) return body.error;
  } catch {
    // context wasn't JSON (e.g. a network-level failure with no response) -
    // fall through to the generic message below.
  }
  return error?.message || 'Something went wrong. Please try again.';
}
