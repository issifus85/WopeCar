import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import supabase from './supabase';

// The website's site-wide announcement bar (admin: Content > Site banner) is stored in the public `site_banner`
// table. The app reads the same row, so switching the banner on/off in admin controls the website bar AND the app's
// home-screen promo card from one place.

const CACHE_MS = 5 * 60 * 1000;
let cached = null;
let cachedAt = 0;

export async function fetchSiteBanner() {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  const { data, error } = await supabase
    .from('site_banner')
    .select('is_active, promo_code')
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  cached = { isActive: !!data.is_active, promoCode: (data.promo_code || '').trim() };
  cachedAt = Date.now();
  return cached;
}

// The dismissal is remembered per promo code, so closing the DETTY10 card keeps it closed across launches, but a
// future campaign with a different code shows again.
function dismissedKey(code) {
  return `wopecar_promo_banner_dismissed_${(code || 'default').toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
}

export async function isPromoBannerDismissed(code) {
  try {
    const key = dismissedKey(code);
    const value = Platform.OS === 'web'
      ? (typeof window !== 'undefined' ? window.localStorage.getItem(key) : null)
      : await SecureStore.getItemAsync(key);
    return value === '1';
  } catch {
    return false;
  }
}

export async function dismissPromoBanner(code) {
  try {
    const key = dismissedKey(code);
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.localStorage.setItem(key, '1');
      return;
    }
    await SecureStore.setItemAsync(key, '1');
  } catch {
    // Not being able to remember the dismissal just means it shows again next launch.
  }
}
