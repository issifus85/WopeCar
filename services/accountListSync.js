// Keeps a device-local car-id list (cart wishlist, favourites) in step with
// its account-level table (cart_items / saved_cars) so the same renter sees
// the same list in the app and on wopecar.com.
//
// Merge rule, per list:
// - First sync of this account on this device: union of local + server,
//   and anything only local is pushed up. Nothing the renter added while
//   signed out is lost.
// - After that, the server copy wins, so a car removed (or booked) on the
//   website also disappears here instead of being pushed back up.
//
// Every call is best-effort: a network/RLS/missing-table error returns null
// and callers keep their local list untouched.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import supabase from './supabase';

function markerKey(table) {
  return `wopecar_${table}_synced_user`;
}

async function readMarker(table) {
  try {
    if (Platform.OS === 'web') {
      return typeof window !== 'undefined' ? window.localStorage.getItem(markerKey(table)) : null;
    }
    return await SecureStore.getItemAsync(markerKey(table));
  } catch {
    return null;
  }
}

async function writeMarker(table, userId) {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.localStorage.setItem(markerKey(table), userId);
      return;
    }
    await SecureStore.setItemAsync(markerKey(table), userId);
  } catch {
    // Worst case the next sync unions again, which never loses anything.
  }
}

export async function clearSyncMarkers() {
  await Promise.allSettled(['cart_items', 'saved_cars'].map(async (table) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.localStorage.removeItem(markerKey(table));
      return;
    }
    await SecureStore.deleteItemAsync(markerKey(table));
  }));
}

export async function fetchServerCarIds(table, userId) {
  const { data, error } = await supabase.from(table).select('car_id').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((row) => String(row.car_id));
}

export async function addServerCarId(table, userId, carId) {
  if (!userId || !carId) return;
  try {
    await supabase.from(table).upsert(
      { user_id: userId, car_id: carId },
      { onConflict: 'user_id,car_id', ignoreDuplicates: true }
    );
  } catch {
    // Best-effort.
  }
}

export async function removeServerCarId(table, userId, carId) {
  if (!userId || !carId) return;
  try {
    await supabase.from(table).delete().eq('user_id', userId).eq('car_id', carId);
  } catch {
    // Best-effort.
  }
}

/**
 * Returns the merged id list to store locally, or null if the server
 * couldn't be reached (caller keeps its local list).
 */
export async function reconcileCarIds(table, userId, localIds) {
  if (!userId) return null;
  let serverIds;
  try {
    serverIds = await fetchServerCarIds(table, userId);
  } catch {
    return null;
  }
  const local = (localIds ?? []).map(String);
  const alreadySynced = (await readMarker(table)) === userId;
  if (alreadySynced) return serverIds;

  const serverSet = new Set(serverIds);
  const localOnly = local.filter((id) => !serverSet.has(id));
  await Promise.all(localOnly.map((id) => addServerCarId(table, userId, id)));
  await writeMarker(table, userId);
  return [...serverIds, ...localOnly];
}
