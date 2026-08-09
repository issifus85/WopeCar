import { Alert } from 'react-native';
import supabase from './supabase';
import { notifyUser } from './adminNotify';
import { sendBookingCancelledEmail, sendBookingConfirmedEmail } from './supabaseApi';
import { getSelfDriveDeliveryFee, calculateSecurityDeposit, calculateRentalPricing } from '../constants/pricing';

const BOOKING_SELECT = `
  id, booking_ref, renter_id, car_id, vendor_id, start_date, end_date,
  pickup_time, return_time, pickup_location, return_location, drive_type,
  addon_names, addon_days, rental_cost, addons_cost, delivery_fee,
  security_deposit, total_cost, status, payment_ref, payment_status,
  vendor_accepted, created_at, updated_at,
  wopecare_plan, wopecare_daily_rate, wopecare_total_cost, wopecare_coverage,
  cars ( name, type, price_per_day, regional_addons ),
  renter:renter_id ( id, full_name, email, phone ),
  vendors ( id, user_id, business_name )
`;

/**
 * `tab` mirrors the 6 spec'd filter tabs. 'paid' filters on payment_status,
 * every other tab filters on status - they're independent axes on this
 * table (a booking can be status=pending AND payment_status=paid, "any
 * status -> paid" per the business rules), so 'all' is the only tab that
 * doesn't add a where clause at all.
 */
export async function listBookings(tab) {
  let query = supabase.from('bookings').select(BOOKING_SELECT).order('created_at', { ascending: false });
  if (tab === 'paid') query = query.eq('payment_status', 'paid');
  else if (tab && tab !== 'all') query = query.eq('status', tab);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getBooking(id) {
  const { data, error } = await supabase.from('bookings').select(BOOKING_SELECT).eq('id', id).single();
  if (error) throw error;
  return data;
}

async function notifyBoth(booking, { type, title, body }) {
  await Promise.all([
    notifyUser({ userId: booking.renter_id, type, title, body, bookingId: booking.id }),
    notifyUser({ userId: booking.vendors?.user_id, type, title, body, bookingId: booking.id }),
  ]);
}

/**
 * Confirm: status=confirmed AND payment_status=paid, per the spec's exact
 * wording for this action. This is one of the two real "Booking Confirmed"
 * triggers (the other is the vendor's own acceptBookingRequest in
 * vendorBookingsApi.js) - fires the real confirmation email here too, since
 * the renter only got a "received, pending confirmation" email at payment
 * time.
 *
 * Only notifies the VENDOR here (push/in-app) - the renter's push/in-app
 * now comes from inside send-booking-confirmed itself (service_role, so it
 * covers both trigger paths uniformly without duplicating here). Vendor
 * still gets their own notification since admin confirming on their behalf
 * is genuinely new information to them, distinct from them having done it
 * themselves via acceptBookingRequest.
 */
export async function confirmBooking(booking) {
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'confirmed', payment_status: 'paid' })
    .eq('id', booking.id)
    .select(BOOKING_SELECT)
    .single();
  if (error) throw error;

  await notifyUser({
    userId: data.vendors?.user_id,
    type: 'booking_confirmed',
    title: 'Booking confirmed',
    body: `Booking ${data.booking_ref} has been confirmed.`,
    bookingId: data.id,
  });
  sendBookingConfirmedEmail(data.id).catch(() => {});
  return data;
}

/**
 * Routes through the cancel-booking Edge Function - the single place the
 * tiered cancellation-refund policy (Settings > Cancellation Policy /
 * app_settings: cancellation_full_refund_hours etc.) and the real Paystack
 * refund are applied, shared with the web admin dashboard and the renter's
 * own cancel flow (contexts/BookingsContext.js) so every surface enforces
 * the same rule instead of three independent reimplementations.
 * notifyBoth/sendBookingCancelledEmail are no longer called here - the Edge
 * Function already inserts both in-app notifications itself.
 */
export async function cancelBooking(booking, reason) {
  const { data: result, error } = await supabase.functions.invoke('cancel-booking', {
    body: { bookingId: booking.id, reason },
  });
  if (error) throw error;
  if (result?.error) throw new Error(result.error);

  if (result.refunded) {
    Alert.alert('Booking cancelled', `GH₵${Math.round(result.refundAmount)} was refunded automatically.`);
  } else if (result.refundAmount > 0) {
    Alert.alert(
      'Booking cancelled',
      `A refund of GH₵${Math.round(result.refundAmount)} is owed but could not be processed automatically. ${result.refundError || ''} Please process it manually in Paystack.`
    );
  }

  sendBookingCancelledEmail(booking.id, reason).catch(() => {});
  return getBooking(booking.id);
}

/** Independent of status, per "any status -> paid (admin only)". */
export async function markBookingPaid(booking) {
  const { data, error } = await supabase
    .from('bookings')
    .update({ payment_status: 'paid' })
    .eq('id', booking.id)
    .select(BOOKING_SELECT)
    .single();
  if (error) throw error;

  await notifyBoth(data, {
    type: 'booking_paid',
    title: 'Payment recorded',
    body: `Payment for booking ${data.booking_ref} has been marked as received.`,
  });
  return data;
}

/**
 * Only available on confirmed bookings, enforced by the caller (UI) per
 * spec - not re-checked here since RLS/the check constraint don't encode
 * that transition rule. Fires two completion emails: send-review-request
 * to the renter (unchanged, pre-existing), send-trip-completed to the
 * vendor + admin/support (new - previously neither heard anything when a
 * trip finished).
 */
export async function markBookingCompleted(booking) {
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'completed' })
    .eq('id', booking.id)
    .select(BOOKING_SELECT)
    .single();
  if (error) throw error;

  await notifyBoth(data, {
    type: 'booking_completed',
    title: 'Booking completed',
    body: `Booking ${data.booking_ref} has been marked as completed.`,
  });
  supabase.functions.invoke('send-review-request', { body: { bookingId: data.id } }).catch(() => {});
  supabase.functions.invoke('send-trip-completed', { body: { bookingId: data.id } }).catch(() => {});
  return data;
}

/**
 * Same recompute shape as app/booking/[id].js's own renter-facing modify
 * flow - critically, that means billable days come from
 * calculateRentalPricing() (chauffeur bookings bill on a 12-hour cycle,
 * self-drive on 24-hour, both driven by pickup/return TIME not just
 * calendar dates), not a naive date-only diff. An earlier version of this
 * function used a plain 24-hour day-diff and silently undercharged every
 * chauffeur modification by half - caught via a live UI test showing a
 * ~50% total-cost drop with the dates unchanged (13,800 GHS rental cost on
 * a 2,300/day car is 6 billable half-day cycles for a 3-calendar-day
 * chauffeur trip, not 3).
 */
export function recomputeBookingCost(booking, { startDate, endDate, pickupTime, returnTime }) {
  const dailyRate = booking.cars?.price_per_day ?? 0;
  const pricing = calculateRentalPricing({
    startDate,
    endDate,
    pickupTime: pickupTime ?? booking.pickup_time,
    returnTime: returnTime ?? booking.return_time,
    drivenBy: booking.drive_type,
    dailyRate,
  });
  const rentalCost = pricing.rentalCost;

  const existingAddonNames = booking.addon_names ?? [];
  const existingAddonDays = booking.addon_days ?? [];
  const addonDefs = booking.cars?.regional_addons ?? [];
  const addonsCost = existingAddonNames.reduce((sum, name, i) => {
    const def = addonDefs.find((a) => a.name === name);
    if (!def) return sum;
    const cappedDays = Math.min(existingAddonDays[i] ?? pricing.billableDays, pricing.billableDays);
    return sum + (def.type === 'per_day' ? def.price * cappedDays : Number(def.price) || 0);
  }, 0);

  const subtotal = rentalCost + addonsCost;
  const deliveryFee = booking.drive_type === 'Self-drive' ? getSelfDriveDeliveryFee() : 0;
  const securityDeposit = calculateSecurityDeposit(subtotal);
  const totalCost = subtotal + deliveryFee + securityDeposit;

  return { days: pricing.billableDays, rentalCost, addonsCost, deliveryFee, securityDeposit, totalCost };
}

/**
 * Modify: reverts to pending per "confirmed -> pending (auto, when renter
 * modifies)" - generalized here to any admin-driven modification too, since
 * a changed date/location invalidates whatever confirmation already
 * happened and needs a fresh look.
 */
export async function modifyBooking(booking, fields) {
  const costs = recomputeBookingCost(booking, fields);
  const patch = {
    start_date: fields.startDate,
    end_date: fields.endDate,
    pickup_time: fields.pickupTime,
    return_time: fields.returnTime,
    pickup_location: fields.pickupLocation,
    return_location: fields.returnLocation,
    rental_cost: costs.rentalCost,
    addons_cost: costs.addonsCost,
    delivery_fee: costs.deliveryFee,
    security_deposit: costs.securityDeposit,
    total_cost: costs.totalCost,
    status: 'pending',
  };

  const { data, error } = await supabase
    .from('bookings')
    .update(patch)
    .eq('id', booking.id)
    .select(BOOKING_SELECT)
    .single();
  if (error) throw error;

  await notifyUser({
    userId: data.renter_id,
    type: 'booking_modified',
    title: 'Your booking was modified',
    bookingId: data.id,
    body: `Booking ${data.booking_ref} was updated by WopeCar. New dates: ${fields.startDate} to ${fields.endDate}. It is now pending reconfirmation.`,
  });

  return data;
}
