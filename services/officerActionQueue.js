import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { advanceTrip, sendQuickReply } from './officerApi';

// Fleet Officer Phase 6: the officer's trip taps (Start trip, I've arrived, Complete, quick replies) keep working with a weak or no
// connection. A tap that can't reach the server is saved on the phone and sent again, in the order it was made, every 15 seconds and
// whenever the app comes back to the screen. The server treats a repeated step as a no-op and doesn't post the same quick reply twice
// within 2 minutes (0193), so a tap that did go through before the connection dropped can't create a duplicate.
//
// A tap the server refuses (for example the trip was reassigned or cancelled meanwhile) is dropped and reported, not retried.
//
// Inspections and agreements already save a draft on the phone as they are filled in (InspectionContext), so they resume after a
// lost connection or a closed app; they are not part of this queue.

const STORAGE_KEY = 'wopecar_officer_action_queue';
const MAX_ITEMS = 12; // SecureStore holds ~2KB per value; each item is ~120 bytes.
const RETRY_MS = 15000;

let queue = [];
let loaded = null;
let flushing = null;
let timer = null;
let appStateSub = null;
const listeners = new Set();

async function readRaw() {
  if (Platform.OS === 'web') return typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
  return SecureStore.getItemAsync(STORAGE_KEY);
}

async function writeRaw(value) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, value);
    return;
  }
  await SecureStore.setItemAsync(STORAGE_KEY, value);
}

function emit(extra = {}) {
  const snapshot = { pending: queue.slice(), ...extra };
  listeners.forEach((fn) => fn(snapshot));
}

async function persist() {
  try {
    await writeRaw(JSON.stringify(queue));
  } catch {
    // Keeping it in memory is still better than losing it.
  }
}

function ensureLoaded() {
  if (!loaded) {
    loaded = readRaw()
      .then((raw) => {
        const saved = raw ? JSON.parse(raw) : [];
        if (Array.isArray(saved)) queue = [...saved, ...queue];
      })
      .catch(() => {});
  }
  return loaded;
}

/** True when the request never got an answer from the server (no connection, timeout), as opposed to the server saying no. */
export function isConnectionError(e) {
  if (!e) return false;
  // PostgREST / Postgres errors carry a code (P0001, 42501, PGRST...). Fetch failures don't.
  if (e.code && String(e.code).length > 0) return false;
  const msg = String(e.message || e).toLowerCase();
  return msg.includes('network') || msg.includes('fetch') || msg.includes('timeout') || msg.includes('timed out')
    || msg.includes('offline') || msg.includes('internet') || msg.includes('connection');
}

function perform(item) {
  if (item.type === 'advance') return advanceTrip(item.taskId, item.status);
  if (item.type === 'quick_reply') return sendQuickReply(item.taskId, item.kind);
  return Promise.resolve();
}

function scheduleRetry() {
  if (!timer && queue.length) {
    timer = setInterval(() => { flushQueue(); }, RETRY_MS);
  }
  if (!appStateSub) {
    appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') flushQueue();
    });
  }
}

function stopRetryIfEmpty() {
  if (!queue.length && timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Sends everything waiting, oldest first. Stops at the first item that still can't reach the server. */
export function flushQueue() {
  if (flushing) return flushing;
  flushing = (async () => {
    await ensureLoaded();
    const dropped = [];
    while (queue.length) {
      const item = queue[0];
      try {
        await perform(item);
      } catch (e) {
        if (isConnectionError(e)) break;
        dropped.push({ ...item, error: e?.message || 'The server refused this step.' });
      }
      queue.shift();
      await persist();
    }
    stopRetryIfEmpty();
    emit(dropped.length ? { dropped } : {});
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/**
 * Runs a trip action now, or keeps it for later if the phone is offline.
 * Resolves { queued: false } when it went through, { queued: true } when it was saved to send later.
 * Throws when the server refused it (show that error to the officer).
 */
export async function runTripAction(item) {
  await ensureLoaded();
  // Anything older still waiting goes first, so steps reach the server in the order they were tapped.
  if (queue.length) {
    await flushQueue();
  }
  if (!queue.length) {
    try {
      await perform(item);
      return { queued: false };
    } catch (e) {
      if (!isConnectionError(e)) throw e;
    }
  }
  const entry = { ...item, at: new Date().toISOString() };
  queue = [...queue, entry].slice(-MAX_ITEMS);
  await persist();
  scheduleRetry();
  emit();
  return { queued: true };
}

export function subscribeQueue(fn) {
  listeners.add(fn);
  ensureLoaded().then(() => {
    fn({ pending: queue.slice() });
    if (queue.length) scheduleRetry();
  });
  return () => listeners.delete(fn);
}
