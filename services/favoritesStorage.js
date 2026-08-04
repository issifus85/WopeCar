import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const FAVORITES_KEY = 'wopecar_favorite_cars';

async function readRaw() {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.localStorage.getItem(FAVORITES_KEY) : null;
  }
  return SecureStore.getItemAsync(FAVORITES_KEY);
}

async function writeRaw(value) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.setItem(FAVORITES_KEY, value);
    return;
  }
  return SecureStore.setItemAsync(FAVORITES_KEY, value);
}

export async function getFavoriteIds() {
  try {
    const raw = await readRaw();
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

export async function setFavoriteIds(ids) {
  await writeRaw(JSON.stringify(ids));
}

export async function clearFavoriteIds() {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.removeItem(FAVORITES_KEY);
    return;
  }
  return SecureStore.deleteItemAsync(FAVORITES_KEY);
}
