import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const CART_KEY = 'wopecar_cart_cars';

async function readRaw() {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.localStorage.getItem(CART_KEY) : null;
  }
  return SecureStore.getItemAsync(CART_KEY);
}

async function writeRaw(value) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.setItem(CART_KEY, value);
    return;
  }
  return SecureStore.setItemAsync(CART_KEY, value);
}

export async function getCartIds() {
  try {
    const raw = await readRaw();
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

export async function setCartIds(ids) {
  await writeRaw(JSON.stringify(ids));
}
