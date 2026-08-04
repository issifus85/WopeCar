import supabase from './supabase';

/** app_settings.value is jsonb - numbers/strings round-trip as-is. */
export async function listAppSettings() {
  const { data, error } = await supabase.from('app_settings').select('*').order('key');
  if (error) throw error;
  return data ?? [];
}

export async function updateAppSetting(key, value) {
  const { error } = await supabase
    .from('app_settings')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key);
  if (error) throw error;
}

export async function listRegions() {
  const { data, error } = await supabase.from('regions').select('*').order('position');
  if (error) throw error;
  return data ?? [];
}

export async function setRegionActive(id, isActive) {
  const { error } = await supabase.from('regions').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

export async function addRegion(name) {
  const { data: existing } = await supabase.from('regions').select('position').order('position', { ascending: false }).limit(1);
  const nextPosition = (existing?.[0]?.position ?? -1) + 1;
  const { error } = await supabase.from('regions').insert({ name, position: nextPosition, is_active: true });
  if (error) throw error;
}

export async function listPromoCodes() {
  const { data, error } = await supabase.from('promo_codes').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createPromoCode({ code, discountType, discountValue, maxUses, expiresAt }) {
  const { error } = await supabase.from('promo_codes').insert({
    code: code.trim().toUpperCase(),
    discount_type: discountType,
    discount_value: discountValue,
    max_uses: maxUses || null,
    expires_at: expiresAt || null,
  });
  if (error) throw error;
}

export async function setPromoActive(id, isActive) {
  const { error } = await supabase.from('promo_codes').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

export async function deletePromoCode(id) {
  const { error } = await supabase.from('promo_codes').delete().eq('id', id);
  if (error) throw error;
}

const TARGET_ROLE = { renters: 'renter', vendors: 'vendor', admins: 'admin' };

/**
 * Bulk-inserts one notification row per targeted user. 'all' targets every
 * role; anything else maps to a single users.role value.
 */
export async function broadcastNotification({ title, body, target }) {
  let query = supabase.from('users').select('id');
  if (target !== 'all') query = query.eq('role', TARGET_ROLE[target]);
  const { data: users, error: usersError } = await query;
  if (usersError) throw usersError;
  if (!users?.length) return 0;

  const rows = users.map((u) => ({ user_id: u.id, type: 'broadcast', title, body }));
  const { error } = await supabase.from('notifications').insert(rows);
  if (error) throw error;
  return rows.length;
}
