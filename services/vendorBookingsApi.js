import supabase, { edgeFunctionErrorMessage } from './supabase';
import { getVendorProfile } from './vendorCarsApi';
import { getVendorBookings, sendBookingCancelledEmail, sendBookingConfirmedEmail } from './supabaseApi';

// Same explicit-column guarantee as getVendorBookings() in supabaseApi.js -
// used by acceptBookingRequest/declineBookingRequest below instead of
// `select('*')`, so a booking's raw update/fetch response passing through
// this vendor-facing module never carries renter_id/total_cost/rental_cost/
// wopecar_margin etc. even transiently, not just omits them from the UI.
const VENDOR_BOOKING_SELECT = `
  id, booking_ref, car_id, vendor_id,
  start_date, end_date, pickup_time, return_time,
  pickup_location, return_location, drive_type, addon_names,
  billable_days, vendor_payout_per_day, vendor_payout_total,
  status, payment_ref, payment_status, vendor_accepted,
  created_at, updated_at,
  cars(name)
`;

// bookings.status ('pending'/'confirmed'/'completed'/'cancelled') plus
// vendor_accepted (null until the vendor responds) together decide the
// vendor-facing status word, matching the shape VendorContext's screens
// already expect from the old mock data (Requested/Confirmed/Completed/
// Declined/Cancelled - see components/VendorStatusBadge.js).
function vendorStatusFor(row) {
  if (row.status === 'pending' && row.vendor_accepted !== true) return 'Requested';
  if (row.status === 'confirmed') return 'Confirmed';
  if (row.status === 'completed') return 'Completed';
  if (row.status === 'cancelled') return row.vendor_accepted === false ? 'Declined' : 'Cancelled';
  return 'Requested';
}

// "Earnings" here means the vendor's own payout - GHS vendor_payout_per_day
// x billable_days, stamped server-side at booking creation by the
// bookings_compute_vendor_payout trigger from the car's admin-set
// payout_per_day (see supabase migration
// compute_vendor_payout_on_booking_insert). Never the renter-facing total -
// this vendor-facing surface must never carry rental_cost/addons_cost/
// total_cost/wopecar_margin at all, not just avoid displaying them (see
// getVendorBookings()'s doc comment in services/supabaseApi.js).
// payoutPending is true when admin hasn't set a payout rate for this car
// yet (payout_per_day was 0 at booking time) - the UI shows "Pending"
// instead of a misleading "GHS 0".
function normalizeVendorBooking(row) {
  return {
    id: row.id,
    carId: row.car_id,
    carName: row.cars?.name ?? 'Untitled Car',
    reference: row.booking_ref,
    startDate: row.start_date,
    endDate: row.end_date,
    pickupTime: row.pickup_time,
    returnTime: row.return_time,
    earnings: Number(row.vendor_payout_total ?? 0),
    payoutPerDay: Number(row.vendor_payout_per_day ?? 0),
    payoutPending: !(Number(row.vendor_payout_per_day ?? 0) > 0),
    status: vendorStatusFor(row),
    vendorAccepted: row.vendor_accepted,
    createdAt: row.created_at,
    declineReason: null, // not persisted server-side - see declineBookingRequest
  };
}

/** Fetches this vendor's bookings and splits them the way the UI expects: still-pending requests vs. everything already resolved. */
export async function getVendorBookingsSplit() {
  const vendor = await getVendorProfile();
  if (!vendor) return { bookingRequests: [], bookingHistory: [] };

  const rows = await getVendorBookings(vendor.id);
  const normalized = rows.map(normalizeVendorBooking);
  return {
    bookingRequests: normalized.filter((b) => b.status === 'Requested'),
    bookingHistory: normalized.filter((b) => b.status !== 'Requested'),
  };
}

/**
 * Accepting sets both status and vendor_accepted in one update - the
 * bookings_vendor_update_guard trigger (0008-era migration) only allows a
 * vendor to touch these two columns, everything else on the row raises.
 * Booking is already paid by this point (checkout only creates the row
 * after Paystack succeeds), so "accept" is the vendor confirming they can
 * fulfill it, not a payment step. This is one of the two real "Booking
 * Confirmed" triggers (the other is admin's confirmBooking in
 * adminBookingsApi.js) - fires the real confirmation email here, since the
 * renter only got a "received, pending confirmation" email at payment time.
 */
export async function acceptBookingRequest(bookingId) {
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'confirmed', vendor_accepted: true })
    .eq('id', bookingId)
    .select(VENDOR_BOOKING_SELECT)
    .single();
  if (error) throw error;
  sendBookingConfirmedEmail(bookingId).catch(() => {});
  return normalizeVendorBooking(data);
}

/**
 * Declining is a cancellation from the vendor's side - routes through the
 * same cancel-booking Edge Function the renter/admin cancel paths use
 * (previously did a raw table update here instead, which meant declining
 * produced zero in-app/push notifications for anyone - cancel-booking now
 * handles that, plus setting vendor_accepted=false itself so
 * vendorStatusFor() still shows this as "Declined" not "Cancelled").
 * sendBookingCancelledEmail is still called separately here since
 * cancel-booking only handles in-app/push, not email (same split as the
 * renter/admin cancel paths).
 */
export async function declineBookingRequest(bookingId, reason) {
  const { data: result, error } = await supabase.functions.invoke('cancel-booking', {
    body: { bookingId, reason },
  });
  if (error) throw new Error(await edgeFunctionErrorMessage(error));
  if (result?.error) throw new Error(result.error);

  sendBookingCancelledEmail(bookingId, reason).catch(() => {});

  const { data, error: fetchError } = await supabase.from('bookings').select(VENDOR_BOOKING_SELECT).eq('id', bookingId).single();
  if (fetchError) throw fetchError;
  return normalizeVendorBooking(data);
}
