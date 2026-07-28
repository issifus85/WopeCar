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
  availabilitySettings: {},
  blockedDates: {},
  vendorSettings: {},
  vendorInspections: {},
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
      availabilitySettings: parsed.availabilitySettings && typeof parsed.availabilitySettings === 'object' ? parsed.availabilitySettings : {},
      blockedDates: parsed.blockedDates && typeof parsed.blockedDates === 'object' ? parsed.blockedDates : {},
      vendorSettings: parsed.vendorSettings && typeof parsed.vendorSettings === 'object' ? parsed.vendorSettings : {},
      vendorInspections: parsed.vendorInspections && typeof parsed.vendorInspections === 'object' ? parsed.vendorInspections : {},
    };
  } catch {
    return { ...EMPTY_VENDOR_DATA };
  }
}

export async function setVendorData(data) {
  await writeRaw(JSON.stringify(data));
}
