import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const SETTINGS_KEY = 'wopecar_settings';

async function readRaw() {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.localStorage.getItem(SETTINGS_KEY) : null;
  }
  return SecureStore.getItemAsync(SETTINGS_KEY);
}

async function writeRaw(value) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.setItem(SETTINGS_KEY, value);
    return;
  }
  return SecureStore.setItemAsync(SETTINGS_KEY, value);
}

export async function getSettings() {
  try {
    const raw = await readRaw();
    const settings = raw ? JSON.parse(raw) : {};
    return settings && typeof settings === 'object' ? settings : {};
  } catch {
    return {};
  }
}

export async function setSettings(settings) {
  await writeRaw(JSON.stringify(settings));
}
