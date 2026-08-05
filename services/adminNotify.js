import supabase from './supabase';

/**
 * Shared "tell this user something happened" helper - every admin write
 * action across the panel (approve/reject vendor, approve/reject/deactivate
 * car, every booking status change) ends with a call here, per the spec's
 * "All booking status changes by admin must trigger a notification" rule
 * generalized to every other domain too. One insert into `notifications`,
 * matching that table's real columns (0009-era schema: user_id, type,
 * title, body, booking_id, is_read default false).
 *
 * Also fires a real Expo push (send-push-notification) so this actually
 * reaches the user's device instead of only being visible if/when they
 * next open the app - best-effort and non-blocking (a push failure, or the
 * user simply having no registered device, must never fail the admin
 * action this is called from).
 */
export async function notifyUser({ userId, type, title, body, bookingId }) {
  if (!userId) return; // best-effort - some rows (e.g. a vendor application) may not resolve a user yet
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type,
    title,
    body: body ?? null,
    booking_id: bookingId ?? null,
  });
  if (error) throw error;

  supabase.functions
    .invoke('send-push-notification', { body: { notifications: [{ userId, title, body }] } })
    .catch(() => {});
}
