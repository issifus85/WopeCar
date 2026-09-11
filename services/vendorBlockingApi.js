import supabase from './supabase';

/**
 * Apple 1.2.0 (User Generated Content) requires a way to block an abusive
 * user. The mobile app has no real peer-to-peer chat (messaging is support-
 * mediated - see contexts/InboxContext.js), so the counterparty a renter
 * actually interacts with is the vendor/host behind a listing, and the real
 * "feed" is the car search/browse feed - see services/carsApi.js's
 * fetchCars, which excludes any car whose vendor is in this list.
 */
export async function getBlockedVendorIds() {
  const { data, error } = await supabase.from('blocked_vendors').select('vendor_id');
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.vendor_id));
}

export async function isVendorBlocked(vendorId) {
  const { data, error } = await supabase
    .from('blocked_vendors')
    .select('id')
    .eq('vendor_id', vendorId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/**
 * A support notification fires automatically (see the
 * on_vendor_blocked_notify_admin trigger, migration
 * add_blocked_vendors_and_terms_acceptance.sql) - no separate call needed
 * here.
 */
export async function blockVendor(vendorId, reason) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('blocked_vendors')
    .insert({ blocker_id: user.id, vendor_id: vendorId, reason: reason || null });
  if (error) throw error;
}

export async function unblockVendor(vendorId) {
  const { error } = await supabase.from('blocked_vendors').delete().eq('vendor_id', vendorId);
  if (error) throw error;
}
