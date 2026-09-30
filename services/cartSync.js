// Best-effort server-side mirror of a signed-in user's cart (the plain
// car-id wishlist from contexts/CartContext.js, not the separate "Save &
// Pay Later" checkout drafts) into the `cart_items` table, so a backend
// cron (send-cart-reminders) can nudge someone who added a car and never
// booked it. The local SecureStore/localStorage copy (services/
// cartStorage.js) stays the real source of truth for the UI - this is
// purely additive plumbing for the reminder feature, never awaited by the
// UI and never allowed to throw into a caller.
import supabase from './supabase';

export async function syncCartItemAdded(userId, carId) {
  if (!userId || !carId) return;
  try {
    await supabase.from('cart_items').upsert(
      { user_id: userId, car_id: carId },
      { onConflict: 'user_id,car_id', ignoreDuplicates: true }
    );
  } catch {
    // Best-effort - a failed sync just means that one item won't get a
    // reminder, it must never block adding to the local cart.
  }
}

export async function syncCartItemRemoved(userId, carId) {
  if (!userId || !carId) return;
  try {
    await supabase.from('cart_items').delete().eq('user_id', userId).eq('car_id', carId);
  } catch {
    // Best-effort, same as above.
  }
}
