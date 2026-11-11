// Pulls the signed-in renter's open "Save & Pay Later" drafts
// (pending_invoices, migration 0065) from the server, so one saved on
// wopecar.com shows in the app's Cart tab too. The app used to list only
// the drafts saved on this phone (cartStorage's saved bookings).
//
// RLS (pending_invoices_renter_select) already limits rows to the caller.
import supabase from './supabase';

/** Open rows (not paid/discarded/voided), or throws so callers can skip the merge. */
export async function fetchOpenPendingInvoices() {
  const { data, error } = await supabase
    .from('pending_invoices')
    .select('id, booking_ref, car_id, start_date, end_date, pickup_time, return_time, pickup_location, return_location, drive_type, billable_days, rental_cost, addons_cost, delivery_fee, security_deposit, wopecare_plan, wopecare_total_cost, with_driver, with_driver_daily_rate, with_driver_total_cost, with_driver_days, addon_names, addon_days, total_cost, created_at, expires_at')
    .is('resolution', null);
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length) return [];

  const carIds = Array.from(new Set(rows.map((r) => r.car_id)));
  const { data: cars } = await supabase
    .from('cars')
    .select('id, name, images, price_per_day')
    .in('id', carIds);
  const carById = new Map((cars ?? []).map((c) => [String(c.id), c]));

  return rows.map((row) => toSavedBooking(row, carById.get(String(row.car_id))));
}

/** Same shape checkout/payment.js's handleSaveToCart stores locally. */
function toSavedBooking(row, car) {
  const addonNames = row.addon_names ?? [];
  const addonDays = row.addon_days ?? [];
  return {
    id: `saved-${row.car_id}-${row.id}`,
    pendingInvoiceId: row.id,
    bookingRef: row.booking_ref,
    carId: String(row.car_id),
    carName: car?.name ?? 'Saved car',
    carImage: car?.images?.[0] ?? null,
    carPricePerDay: car?.price_per_day ?? null,
    startDate: row.start_date,
    endDate: row.end_date,
    totalDays: row.billable_days,
    pickupTime: row.pickup_time,
    returnTime: row.return_time,
    pickupLocation: row.pickup_location,
    returnLocation: row.return_location ?? row.pickup_location,
    driveType: row.drive_type,
    addons: addonNames.map((name, i) => ({ name, days: addonDays[i] ?? row.billable_days })),
    wopeCare: { plan: row.wopecare_plan ?? 'none', totalCost: row.wopecare_total_cost ?? 0 },
    withDriver: {
      selected: !!row.with_driver,
      dailyRate: row.with_driver_daily_rate ?? 0,
      totalCost: row.with_driver_total_cost ?? 0,
      days: row.with_driver_days ?? null,
    },
    deliveryFee: row.delivery_fee ?? 0,
    securityDeposit: row.security_deposit ?? 0,
    rentalCost: row.rental_cost ?? 0,
    addonsCost: row.addons_cost ?? 0,
    totalCost: row.total_cost,
    // No local form/document picks for a draft saved elsewhere - Cart's
    // Complete Payment fills documents from what's already on file.
    form: null,
    licenseFront: null,
    licenseBack: null,
    proofOfAddress: null,
    savedAt: row.created_at,
    expiresAt: row.expires_at,
    fromServer: true,
  };
}

/**
 * Local saved bookings + server rows: adds server drafts this phone doesn't
 * have, and drops local drafts whose row was already paid/discarded
 * elsewhere (no longer open on the server). Local drafts without a
 * pendingInvoiceId (none should exist, but older builds) are kept.
 */
export function mergeSavedBookings(local, serverOpen) {
  const openIds = new Set(serverOpen.map((b) => b.pendingInvoiceId));
  const kept = local.filter((b) => !b.pendingInvoiceId || openIds.has(b.pendingInvoiceId));
  const keptIds = new Set(kept.map((b) => b.pendingInvoiceId).filter(Boolean));
  const added = serverOpen.filter((b) => !keptIds.has(b.pendingInvoiceId));
  return [...kept, ...added];
}
