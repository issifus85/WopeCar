import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const BOOKINGS_KEY = 'wopecar_local_bookings';

async function readRaw() {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.localStorage.getItem(BOOKINGS_KEY) : null;
  }
  return SecureStore.getItemAsync(BOOKINGS_KEY);
}

async function writeRaw(value) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.setItem(BOOKINGS_KEY, value);
    return;
  }
  return SecureStore.setItemAsync(BOOKINGS_KEY, value);
}

export async function getBookings() {
  try {
    const raw = await readRaw();
    const bookings = raw ? JSON.parse(raw) : [];
    return Array.isArray(bookings) ? bookings : [];
  } catch {
    return [];
  }
}

export async function setBookings(bookings) {
  await writeRaw(JSON.stringify(bookings));
}
