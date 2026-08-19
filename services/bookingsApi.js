import supabase, { getCurrentUser } from './supabase';

/**
 * Minimal normalization - just the fields Payment History needs. This is
 * NOT a full replacement for the local-storage BookingsContext (that
 * remains local-storage-based; see PROJECT.md) - it's a narrow read-only
 * client, used only to show real payment records.
 *
 * Supabase's `bookings.payment_status` is binary (unpaid/paid/refunded) -
 * unlike the old Laravel `paid` column, there's no partial-payment amount
 * to track, so `paid` is just `total_cost` when `payment_status = 'paid'`,
 * else 0. `gateway` is hardcoded - Paystack is the only payment gateway
 * this app has ever used.
 */
function normalizeBookingPayment(raw) {
  return {
    id: raw.id,
    code: raw.booking_ref,
    total: Number(raw.total_cost ?? 0),
    paid: raw.payment_status === 'paid' ? Number(raw.total_cost ?? 0) : 0,
    status: raw.payment_status,
    gateway: 'Paystack',
    startDate: raw.start_date,
    endDate: raw.end_date,
    createdAt: raw.created_at,
    // Whether a real QuickBooks invoice/receipt exists to view - see
    // services/quickbooksApi.js. 'paid' means quickbooks-record-payment
    // has already run (qb_payment_id set), so both PDFs are fetchable.
    invoiceStatus: raw.invoice_status ?? 'not_created',
  };
}

/**
 * Real Supabase bookings, scoped to the caller via the existing
 * `bookings_renter_select` RLS policy - replaces the old Laravel GET
 * /api/bookings, which required the same dead Sanctum token as the
 * Places/Paystack bugs (see services/tokenStorage.js's header comment).
 * No proxy/Edge Function needed here, unlike Places/Paystack - this data
 * already lives in a table the caller's own session can read directly.
 */
export async function getBookings() {
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from('bookings')
    .select('id, booking_ref, total_cost, payment_status, start_date, end_date, created_at, invoice_status')
    .eq('renter_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalizeBookingPayment);
}
