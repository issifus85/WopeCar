import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const INBOX_KEY = 'wopecar_local_inbox';

// Unlike the other local-storage services (one key = one flat array), the
// inbox bundles conversations/messages/notifications/remindedBookingIds
// together under a single key because they're always loaded and saved as a
// unit. That also means every write re-serializes the whole inbox, and on
// native this is backed by the Keychain (expo-secure-store), which rejects
// values above ~2KB - so messages/notifications are trimmed to a bounded
// count on every write to keep this well under that ceiling indefinitely.
const MAX_MESSAGES = 200;
const MAX_NOTIFICATIONS = 100;

const EMPTY_INBOX = {
  conversations: [],
  messages: [],
  notifications: [],
  remindedBookingIds: [],
};

async function readRaw() {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.localStorage.getItem(INBOX_KEY) : null;
  }
  return SecureStore.getItemAsync(INBOX_KEY);
}

async function writeRaw(value) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.setItem(INBOX_KEY, value);
    return;
  }
  return SecureStore.setItemAsync(INBOX_KEY, value);
}

export async function getInboxData() {
  try {
    const raw = await readRaw();
    if (!raw) return { ...EMPTY_INBOX };
    const parsed = JSON.parse(raw);
    return {
      conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      remindedBookingIds: Array.isArray(parsed.remindedBookingIds) ? parsed.remindedBookingIds : [],
    };
  } catch {
    return { ...EMPTY_INBOX };
  }
}

export async function setInboxData(data) {
  const trimmed = {
    conversations: data.conversations,
    messages: data.messages.slice(-MAX_MESSAGES),
    notifications: data.notifications.slice(-MAX_NOTIFICATIONS),
    remindedBookingIds: data.remindedBookingIds,
  };
  await writeRaw(JSON.stringify(trimmed));
}
