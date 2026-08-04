import supabase from './supabase';
import { getVendorProfile } from './vendorCarsApi';
import { getVendorBookings, sendBookingCancelledEmail } from './supabaseApi';

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

// "Earnings" here means the vendor's own take - rental + add-ons, not the
// renter-facing total (which also includes the refundable security deposit
// and, for self-drive, WopeCar's own delivery fee - neither of those is the
// vendor's money).
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
    earnings: Number(row.rental_cost ?? 0) + Number(row.addons_cost ?? 0),
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
 * fulfill it, not a payment step.
 */
export async function acceptBookingRequest(bookingId) {
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'confirmed', vendor_accepted: true })
    .eq('id', bookingId)
    .select('*, cars(name)')
    .single();
  if (error) throw error;
  return normalizeVendorBooking(data);
}

/**
 * Declining is a cancellation from the vendor's side - reuses the same
 * send-booking-cancelled Edge Function the renter/admin cancel paths use,
 * so client, vendor (this vendor), and admin all get notified consistently.
 * `reason` is best-effort, forwarded into that email only - there's no
 * dedicated column for it on `bookings` (matching adminBookingsApi.
 * cancelBooking's existing reason handling, which doesn't persist it either).
 */
export async function declineBookingRequest(bookingId, reason) {
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', vendor_accepted: false })
    .eq('id', bookingId)
    .select('*, cars(name)')
    .single();
  if (error) throw error;
  sendBookingCancelledEmail(bookingId, reason).catch(() => {});
  return normalizeVendorBooking(data);
}
