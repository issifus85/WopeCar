// Real account deletion lives in services/supabaseAuthApi.js (Supabase-
// native, via the delete-account Edge Function) and is wired through
// AuthContext.deleteAccount - this file used to have its own legacy
// Laravel version, but nothing has ever called it (confirmed unused),
// so it's not carried forward here.

import supabase, { getCurrentUser } from './supabase';

/**
 * The caller's own profile + bookings as one raw payload - a one-off data
 * dump the user shares/saves, not app state. Both reads are scoped to the
 * caller via existing RLS (`users_own_select`, `bookings_renter_select`),
 * no proxy needed. Replaces the old Laravel GET /api/account/export, which
 * required the same dead Sanctum token as the Places/Paystack bugs (see
 * services/tokenStorage.js's header comment).
 */
export async function exportData() {
  const user = await getCurrentUser();
  const [{ data: profile, error: profileError }, { data: bookings, error: bookingsError }] = await Promise.all([
    supabase.from('users').select('full_name, email, phone').eq('id', user.id).single(),
    supabase.from('bookings').select('booking_ref, start_date, end_date, total_cost, payment_status, created_at').eq('renter_id', user.id),
  ]);
  if (profileError) throw profileError;
  if (bookingsError) throw bookingsError;

  return {
    profile: { name: profile.full_name, email: profile.email, phone: profile.phone },
    bookings: bookings ?? [],
  };
}

/**
 * Settings > Security Alerts toggle. Real `users.security_alerts_enabled`
 * column (migration `add_security_alerts_enabled_to_users`) - replaces the
 * old Laravel GET/PUT /api/account/security-alerts, same dead-token issue.
 */
export async function getSecurityAlerts() {
  const user = await getCurrentUser();
  const { data, error } = await supabase.from('users').select('security_alerts_enabled').eq('id', user.id).single();
  if (error) throw error;
  return !!data.security_alerts_enabled;
}

export async function updateSecurityAlerts(enabled) {
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from('users')
    .update({ security_alerts_enabled: enabled })
    .eq('id', user.id)
    .select('security_alerts_enabled')
    .single();
  if (error) throw error;
  return !!data.security_alerts_enabled;
}
