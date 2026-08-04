import supabase from './supabase';

function normalizeRow(row) {
  if (!row) return null;
  return { code: row.code, discountType: row.discount_type, discountValue: Number(row.discount_value) };
}

/**
 * Read-only check (no mutation) used for the checkout "Apply" preview -
 * throws if the code is invalid, expired, inactive, or already at its use
 * limit. Actual redemption (which increments uses_count) only happens once,
 * at booking creation - see redeemPromoCode().
 */
export async function validatePromoCode(code) {
  const { data, error } = await supabase.rpc('validate_promo_code', { p_code: code });
  if (error) throw new Error(error.message || 'Invalid or expired promo code.');
  const row = normalizeRow(data?.[0]);
  if (!row) throw new Error('Invalid or expired promo code.');
  return row;
}

/**
 * Atomically re-validates and consumes one use - called once, at booking
 * creation (checkout/payment.js), mirroring the reserve-then-confirm
 * discipline the rest of checkout already follows, so a code is only ever
 * spent by a booking that actually gets created.
 */
export async function redeemPromoCode(code) {
  const { data, error } = await supabase.rpc('redeem_promo_code', { p_code: code });
  if (error) throw new Error(error.message || 'Invalid or expired promo code.');
  const row = normalizeRow(data?.[0]);
  if (!row) throw new Error('Invalid or expired promo code.');
  return row;
}
