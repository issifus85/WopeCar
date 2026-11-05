// WopeDriver (driver service) - app side of the backend in supabase/migrations/0171_wopedriver.sql.
// The website uses the same tables and RPCs (create_driver_booking / cancel_driver_booking / wopedriver_quote).
import supabase, { getCurrentUser, edgeFunctionErrorMessage } from './supabase';
import { payWithPaystack } from './paystackCheckout';

const num = (v, fallback = 0) => (v == null || Number.isNaN(Number(v)) ? fallback : Number(v));

export async function getDriverServiceConfig() {
  const [settingsRes, packagesRes, zonesRes] = await Promise.all([
    supabase.from('driver_service_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('driver_service_packages').select('id, label, hours, price, description').eq('is_active', true).order('sort_order').order('hours'),
    supabase.from('driver_service_zones').select('id, label, description, addon_fee').eq('is_active', true).order('sort_order'),
  ]);
  if (settingsRes.error) throw settingsRes.error;
  if (packagesRes.error) throw packagesRes.error;
  if (zonesRes.error) throw zonesRes.error;
  const s = settingsRes.data ?? {};
  return {
    settings: {
      isEnabled: s.is_enabled !== false,
      extraHourRate: num(s.extra_hour_rate, 50),
      minHours: num(s.min_hours, 2),
      maxHoursPerDay: num(s.max_hours_per_day, 12),
      earliestStartHour: num(s.earliest_start_hour, 5),
      latestEndHour: num(s.latest_end_hour, 23),
      minNoticeHours: num(s.min_notice_hours, 24),
      bookingHorizonDays: num(s.booking_horizon_days, 90),
      maxDaysPerRequest: num(s.max_days_per_request, 14),
      cancellationNoticeHours: num(s.cancellation_notice_hours, 24),
      serviceNote: s.service_note ?? '',
      ownCarNote: s.own_car_note ?? '',
      supportPhone: s.support_phone ?? '',
    },
    packages: (packagesRes.data ?? []).map((p) => ({ id: p.id, label: p.label, hours: num(p.hours), price: num(p.price), description: p.description ?? '' })),
    zones: (zonesRes.data ?? []).map((z) => ({ id: z.id, label: z.label, description: z.description ?? '', addonFee: num(z.addon_fee) })),
  };
}

// The signed-in renter's paid self-drive rentals that still have days left and no driver yet - the ones a
// WopeDriver can be added to. The database re-checks all of this when the request is created.
export async function getEligibleRentals() {
  const user = await getCurrentUser();
  if (!user) return [];
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('bookings')
    .select('id, booking_ref, start_date, end_date, pickup_location, pickup_time, drive_type, with_driver, status, payment_status, cars(name, make, model, transmission, images)')
    .eq('renter_id', user.id)
    .in('status', ['pending', 'confirmed'])
    .eq('payment_status', 'paid')
    .gte('end_date', todayIso)
    .order('start_date');
  if (error) throw error;
  return (data ?? [])
    .filter((b) => !b.with_driver && String(b.drive_type ?? '').toLowerCase().startsWith('self'))
    .map((b) => ({
      id: b.id,
      ref: b.booking_ref,
      startDate: b.start_date,
      endDate: b.end_date,
      pickupLocation: b.pickup_location ?? '',
      carName: [b.cars?.make, b.cars?.model].filter(Boolean).join(' ') || b.cars?.name || 'Your rental',
      transmission: b.cars?.transmission ?? null,
      image: Array.isArray(b.cars?.images) ? b.cars.images[0] : null,
    }));
}

function rpcError(error) {
  return new Error(error?.message || 'Something went wrong. Please try again.');
}

/** payload matches create_driver_booking(p jsonb). Returns { id, booking_ref, total_cost }. */
export async function createDriverBooking(payload) {
  const { data, error } = await supabase.rpc('create_driver_booking', { p: { ...payload, source: 'app' } });
  if (error) throw rpcError(error);
  // Emails/in-app notice are best-effort: the request is already saved.
  supabase.functions.invoke('send-driver-booking-notification', { body: { driverBookingId: data.id, event: 'created' } }).catch(() => {});
  return data;
}

function normalizeDriverBooking(b) {
  return {
    id: b.id,
    ref: b.booking_ref,
    serviceType: b.service_type,
    rentalBookingId: b.rental_booking_id,
    carDescription: b.car_description ?? '',
    carTransmission: b.car_transmission ?? '',
    carPlate: b.car_plate ?? '',
    meetingPoint: b.meeting_point,
    usesRentalPickup: !!b.uses_rental_pickup,
    contactName: b.contact_name ?? '',
    contactPhone: b.contact_phone ?? '',
    notes: b.notes ?? '',
    status: b.status,
    paymentStatus: b.payment_status,
    dayCount: b.day_count,
    baseTotal: num(b.base_total),
    extraTotal: num(b.extra_total),
    addonTotal: num(b.addon_total),
    total: num(b.total_cost),
    amountPaid: num(b.amount_paid),
    // What the customer still owes, and what WopeCar owes back after a change that lowered the total.
    amountDue: Math.max(0, Math.round((num(b.total_cost) - num(b.amount_paid)) * 100) / 100),
    refundDue: Math.max(0, Math.round((num(b.amount_paid) - num(b.total_cost)) * 100) / 100),
    modificationCount: num(b.modification_count),
    firstDate: b.first_service_date,
    lastDate: b.last_service_date,
    driverName: b.assigned_driver_name ?? '',
    driverPhone: b.assigned_driver_phone ?? '',
    cancelReason: b.cancel_reason ?? '',
    createdAt: b.created_at,
    days: (b.driver_booking_days ?? [])
      .map((d) => ({
        id: d.id,
        date: d.service_date,
        startTime: d.start_time,
        zoneId: d.zone_id ?? null,
        hours: num(d.hours),
        zoneLabel: d.zone_label ?? '',
        packageLabel: d.package_label ?? '',
        base: num(d.base_price),
        extraHours: num(d.extra_hours),
        extra: num(d.extra_price),
        addon: num(d.addon_price),
        total: num(d.total),
      }))
      .sort((a, b2) => a.date.localeCompare(b2.date)),
  };
}

export async function getMyDriverBookings() {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('driver_bookings')
    .select('*, driver_booking_days(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map(normalizeDriverBooking);
}

export async function getDriverBooking(id) {
  const { data, error } = await supabase.from('driver_bookings').select('*, driver_booking_days(*)').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? normalizeDriverBooking(data) : null;
}

export async function cancelDriverBooking(id, reason) {
  const { error } = await supabase.rpc('cancel_driver_booking', { p_id: id, p_reason: reason ?? null });
  if (error) throw rpcError(error);
  // Tells support (with any refund owed) and emails the customer. Best-effort: the cancel is already saved.
  supabase.functions.invoke('send-driver-booking-notification', { body: { driverBookingId: id, event: 'cancelled' } }).catch(() => {});
}

/** Change a request. payload has the same fields as createDriverBooking. Returns { id, booking_ref, total_cost, amount_paid, amount_due, status }. */
export async function modifyDriverBooking(id, payload) {
  const { data, error } = await supabase.rpc('modify_driver_booking', { p_id: id, p: payload });
  if (error) throw rpcError(error);
  supabase.functions.invoke('send-driver-booking-notification', { body: { driverBookingId: id, event: 'modified' } }).catch(() => {});
  return data;
}

/**
 * Pays what is due on a driver booking with Paystack, then records it (confirm-driver-booking-payment verifies the
 * transaction with Paystack; paystack-webhook does the same if the app is closed mid-payment).
 * Resolves with { status, amountPaid, amountDue }. Throws an Error with a user-facing message if cancelled or refused.
 */
export async function payDriverBooking(driverBookingId, amount) {
  let reference;
  try {
    reference = await payWithPaystack(amount, null, 'wopedriver', { driverBookingId });
  } catch (e) {
    // The sheet was closed, but a Mobile Money approval can still land: check the started transaction before giving up.
    if (!e?.reference) throw e;
    const { data } = await supabase.functions.invoke('confirm-driver-booking-payment', { body: { driverBookingId, reference: e.reference } });
    if (data?.status === 'applied' || data?.status === 'already_applied') return data;
    throw e;
  }
  const { data, error } = await supabase.functions.invoke('confirm-driver-booking-payment', { body: { driverBookingId, reference } });
  if (error) throw new Error(await edgeFunctionErrorMessage(error));
  if (data?.error) throw new Error(data.error);
  if (data?.status === 'not_paid') throw new Error('Payment was not successful. Please try again.');
  return data;
}

export const DRIVER_STATUS_LABELS = {
  requested: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  declined: 'Not available',
};
