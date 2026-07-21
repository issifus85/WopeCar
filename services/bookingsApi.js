import { request } from './api';

/**
 * Minimal normalization - just the fields Payment History needs. This is
 * NOT a full replacement for the local-storage BookingsContext (that
 * remains local-storage-based; see PROJECT.md) - it's a narrow read-only
 * client for the real Booking API, used only to show real payment records.
 */
function normalizeBookingPayment(raw) {
  return {
    id: raw.id,
    code: raw.code,
    total: Number(raw.total ?? 0),
    paid: Number(raw.paid ?? 0),
    status: raw.status,
    gateway: raw.gateway,
    startDate: raw.start_date,
    endDate: raw.end_date,
    createdAt: raw.created_at,
  };
}

/**
 * GET /api/bookings
 */
export async function getBookings() {
  const json = await request('/bookings', { auth: true });
  return json.data.map(normalizeBookingPayment);
}
