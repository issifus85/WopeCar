import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const VENDOR_KEY = 'wopecar_vendor_data';

// Bundled under one key (cars/earnings/bookings/settings always load and
// save together) - same reasoning as inboxStorage.js. This dataset is
// mock-only and bounded (a handful of cars/bookings), well under
// expo-secure-store's ~2KB native ceiling, so no trimming is needed here.
const EMPTY_VENDOR_DATA = {
  cars: [],
  earningsHistory: [],
  bookingRequests: [],
  bookingHistory: [],
  // Cars are Supabase-native now (see services/vendorCarsApi.js) and never
  // land in this local blob, so `cars.length === 0` can no longer signal
  // "first ever load" for the other mock domains below - this flag does.
  mockDataSeeded: false,
};

async function readRaw() {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.localStorage.getItem(VENDOR_KEY) : null;
  }
  return SecureStore.getItemAsync(VENDOR_KEY);
}

async function writeRaw(value) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.setItem(VENDOR_KEY, value);
    return;
  }
  return SecureStore.setItemAsync(VENDOR_KEY, value);
}

export async function getVendorData() {
  try {
    const raw = await readRaw();
    if (!raw) return { ...EMPTY_VENDOR_DATA };
    const parsed = JSON.parse(raw);
    return {
      cars: Array.isArray(parsed.cars) ? parsed.cars : [],
      earningsHistory: Array.isArray(parsed.earningsHistory) ? parsed.earningsHistory : [],
      bookingRequests: Array.isArray(parsed.bookingRequests) ? parsed.bookingRequests : [],
      bookingHistory: Array.isArray(parsed.bookingHistory) ? parsed.bookingHistory : [],
      mockDataSeeded: !!parsed.mockDataSeeded,
    };
  } catch {
    return { ...EMPTY_VENDOR_DATA };
  }
}

export async function setVendorData(data) {
  await writeRaw(JSON.stringify(data));
}

export async function clearVendorData() {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.removeItem(VENDOR_KEY);
    return;
  }
  return SecureStore.deleteItemAsync(VENDOR_KEY);
}
