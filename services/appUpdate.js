import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import supabase from './supabase';

// Bundle/package ids of the real store builds. Expo Go, dev clients and the
// web preview report different ids (or none) and must never be told to
// "update" - their version number says nothing about the store listing.
const STORE_APP_IDS = ['com.wopecar.WopeCar'];

const PLAY_STORE_FALLBACK_URL = 'https://play.google.com/store/apps/details?id=com.wopecar.WopeCar';
const REFETCH_AFTER_MS = 5 * 60 * 1000;

const platformKeys = Platform.OS === 'ios'
  ? { latest: 'latest_ios_version', min: 'min_supported_ios_version', url: 'app_store_url' }
  : { latest: 'latest_android_version', min: 'min_supported_android_version', url: 'play_store_url' };

function parseVersion(v) {
  return String(v ?? '').split('.').map((part) => parseInt(part, 10) || 0);
}

// True when version `a` is older than `b` ("1.0.3" < "1.0.10", "1.0" < "1.0.1").
export function isOlderVersion(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff < 0;
  }
  return false;
}

// The installed *binary's* version (what the store knows), not the OTA
// bundle's - an over-the-air update ships new JS inside an old binary and
// must not count as having updated the app.
function installedVersion() {
  return Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null;
}

function isStoreBuild() {
  if (Platform.OS === 'web') return false;
  return STORE_APP_IDS.includes(Application.applicationId ?? '');
}

/**
 * Compares the installed version with the admin-managed app_settings
 * (latest_*_version, min_supported_*_version) and says whether the user can
 * keep going ('none'), should be nudged ('optional'), or must update before
 * using the app ('required'). Re-checks when the app returns to the
 * foreground, since a phone can sit backgrounded for days.
 */
export function useAppUpdate() {
  const [state, setState] = useState({ status: 'none', latest: null, storeUrl: null });
  const lastFetchedAt = useRef(0);

  const check = useCallback(async () => {
    if (!isStoreBuild()) return;
    const installed = installedVersion();
    if (!installed) return;
    lastFetchedAt.current = Date.now();
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', [platformKeys.latest, platformKeys.min, platformKeys.url]);
      if (error || !data) return;
      const values = Object.fromEntries(data.map((row) => [row.key, row.value]));
      const latest = typeof values[platformKeys.latest] === 'string' ? values[platformKeys.latest] : null;
      const min = typeof values[platformKeys.min] === 'string' ? values[platformKeys.min] : null;
      const configuredUrl = typeof values[platformKeys.url] === 'string' && values[platformKeys.url].trim() ? values[platformKeys.url].trim() : null;
      const storeUrl = configuredUrl ?? (Platform.OS === 'android' ? PLAY_STORE_FALLBACK_URL : null);

      let status = 'none';
      if (min && isOlderVersion(installed, min)) status = 'required';
      else if (latest && isOlderVersion(installed, latest)) status = 'optional';
      setState({ status, latest, storeUrl });
    } catch {
      // Offline or settings unreachable: never block anyone on a failed check.
    }
  }, []);

  useEffect(() => {
    check();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && Date.now() - lastFetchedAt.current > REFETCH_AFTER_MS) check();
    });
    return () => subscription.remove();
  }, [check]);

  const openStore = useCallback(() => {
    if (state.storeUrl) Linking.openURL(state.storeUrl).catch(() => {});
  }, [state.storeUrl]);

  return { ...state, openStore };
}
