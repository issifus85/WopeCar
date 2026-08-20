import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const CART_KEY = 'wopecar_cart_cars';
// Separate key/domain from CART_KEY above - that one is a plain wishlist of
// car ids ("cars I might book later"), this one holds full checkout drafts
// a renter backed out of paying for mid-checkout ("Save & Pay Later" on
// checkout/payment.js), each with its own 24h expiry. Same
// read/write/get/set shape as every other *Storage.js module (see
// PROJECT.md 6.2) even though it lives in this file rather than a
// dedicated one, since both are the same "Cart tab" domain.
const SAVED_BOOKINGS_KEY = 'wopecar_cart_saved_bookings';

async function readRaw(key) {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  }
  return SecureStore.getItemAsync(key);
}

async function writeRaw(key, value) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
    return;
  }
  return SecureStore.setItemAsync(key, value);
}

export async function getCartIds() {
  try {
    const raw = await readRaw(CART_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

export async function setCartIds(ids) {
  await writeRaw(CART_KEY, JSON.stringify(ids));
}

export async function clearCartIds() {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.removeItem(CART_KEY);
    return;
  }
  return SecureStore.deleteItemAsync(CART_KEY);
}

export async function getSavedBookings() {
  try {
    const raw = await readRaw(SAVED_BOOKINGS_KEY);
    const bookings = raw ? JSON.parse(raw) : [];
    return Array.isArray(bookings) ? bookings : [];
  } catch {
    return [];
  }
}

export async function setSavedBookings(bookings) {
  await writeRaw(SAVED_BOOKINGS_KEY, JSON.stringify(bookings));
}
