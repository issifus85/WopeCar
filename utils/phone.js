// A renter's phone number is how support and the host reach them about a
// booking, so checkout won't go ahead without one. This only rules out
// obvious junk (empty, "0", a few letters); it does not try to validate
// every country's format. Kept in step with the bookings_require_renter_phone
// trigger (supabase/migrations/0178), which needs at least 7 digits too.
export const MIN_PHONE_DIGITS = 7;

export function phoneDigitCount(phone) {
  return String(phone ?? '').replace(/\D/g, '').length;
}

export function isUsablePhone(phone) {
  return phoneDigitCount(phone) >= MIN_PHONE_DIGITS;
}
