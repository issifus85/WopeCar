import supabase from './supabase';

// Car-fetching (fetchCars/fetchCarById/fetchCarAvailability + normalizeCar)
// used to live here as prep work; services/carsApi.js is now the real, live
// implementation (see the "Laravel -> Supabase Data Migration, Phase 1"
// plan) - import from there instead of duplicating it here.

function generateBookingRef() {
  const year = new Date().getFullYear();
  const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `WC-${year}-${suffix}`;
}

/**
 * Inserts a row into `bookings`, generating booking_ref in the WC-YYYY-XXXX
 * format. `bookingData` is expected already shaped in the table's own
 * snake_case columns (renter_id, car_id, start_date, ...) - there's no
 * existing camelCase Booking shape from the Laravel side to translate from
 * here (services/bookingsApi.js's createBooking() sends a differently-
 * shaped payload to a different backend entirely), so guessing at a
 * translation felt worse than being explicit about the convention.
 *
 * booking_ref is unique, and a random 4-digit suffix isn't guaranteed
 * unique - retries with a fresh ref on a unique-violation (Postgres code
 * 23505) specifically, up to 5 attempts, and lets any other error surface
 * immediately.
 */
export async function createBooking(bookingData) {
  const maxAttempts = 5;
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await supabase
      .from('bookings')
      .insert({ ...bookingData, booking_ref: generateBookingRef() })
      .select()
      .single();

    if (!error) return data;
    if (error.code !== '23505') throw error;
    lastError = error;
  }

  throw lastError;
}

/**
 * Bookings for a renter, with the car they're for joined in - a booking
 * list is not useful without at least the car's name/image, and the
 * Laravel-backed equivalent this is meant to mirror includes the same.
 */
export async function getUserBookings(userId) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, cars(*)')
    .eq('renter_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * Bookings for a vendor. Explicitly lists every column except renter_id -
 * "excludes renter personal info" per the spec - rather than `select('*')`.
 * This is the concrete fix for the gap flagged in 0002_rls_policies.sql:
 * RLS alone can't hide a single column while allowing the rest of the row,
 * so the actual guarantee has to live here, in the one function the app is
 * expected to use for a vendor's booking list, rather than in the database.
 * A raw `select('*')` against `bookings` as this same vendor would still
 * return renter_id - this function is the guarantee, not RLS.
 */
export async function getVendorBookings(vendorId) {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id, booking_ref, car_id, vendor_id,
      start_date, end_date, pickup_time, return_time,
      pickup_location, return_location, drive_type, addon_names,
      rental_cost, addons_cost, delivery_fee, security_deposit, total_cost,
      status, payment_ref, payment_status, vendor_accepted,
      created_at, updated_at,
      cars(*)
    `)
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * Renter-side update - covers both post-payment confirmation
 * (payment_status/payment_ref) and cancellation (status: 'cancelled').
 * RLS + the bookings_renter_update_guard trigger (0008_bookings_core.sql)
 * are what actually enforce a renter can't touch dates/cost/etc through
 * this - this function doesn't re-check that itself, it just calls update()
 * and lets the database reject anything out of bounds.
 */
export async function updateBooking(id, patch) {
  const { data, error } = await supabase
    .from('bookings')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Uploads a license-front/license-back/proof-of-address image to the
 * `documents` bucket (folder-ownership RLS already set up in
 * 0003_storage_policies.sql) and records it in the `documents` table
 * (0008_bookings_core.sql). Mirrors supabaseAuthApi.js's uploadAvatar()
 * fetch().arrayBuffer() pattern for turning a local picker URI into
 * uploadable bytes.
 */
export async function uploadBookingDocument(userId, bookingId, type, uri) {
  const arrayBuffer = await fetch(uri).then((res) => res.arrayBuffer());
  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(uri);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
  const path = `${userId}/${bookingId}-${type}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(path, arrayBuffer, {
      contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { error } = await supabase
    .from('documents')
    .insert({ user_id: userId, booking_id: bookingId, type, file_path: path });
  if (error) throw error;
}

/**
 * Attaches this booking to a document the renter already has on file
 * (from a previous booking, or uploaded directly via the Documents Hub)
 * instead of re-uploading the same file bytes - see
 * documentsApi.js's getMyVerificationDocumentsByType, which is what
 * checkout/form.js calls to find the existing filePath passed in here.
 * Still inserts a real per-booking `documents` row (same as
 * uploadBookingDocument) so admin's per-booking document view has a real
 * row to find for every booking, reused file or not.
 */
export async function linkExistingBookingDocument(userId, bookingId, type, filePath) {
  const { error } = await supabase
    .from('documents')
    .insert({ user_id: userId, booking_id: bookingId, type, file_path: filePath });
  if (error) throw error;
}

/**
 * Marks every date in [startDate, endDate] as booked for a car, so
 * carsApi.js's fetchCarAvailability() (which reads this same table) greys
 * them out for future bookings. Best-effort by design: called after a
 * booking is already confirmed, and a failure here shouldn't undo or block
 * that - matches the "advisory, not a hard lock" behavior this app has
 * always had around availability (see fetchCarAvailability's own doc
 * comment), just now actually populated instead of always empty.
 */
export async function markDatesBooked(carId, startDate, endDate) {
  const dates = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (cursor <= end) {
    dates.push({ car_id: carId, date: cursor.toISOString().slice(0, 10), status: 'booked' });
    cursor.setDate(cursor.getDate() + 1);
  }
  const { error } = await supabase.from('availability').insert(dates);
  if (error) throw error;
}

/**
 * Sends the real booking-confirmation email (Resend, via the
 * send-booking-confirmation Edge Function) - best-effort by design, same
 * spirit as markDatesBooked above: called after a booking is already
 * created and paid for, so a failed send shouldn't undo or block that or
 * surface as a checkout error. The function re-fetches the booking
 * server-side scoped to the caller's own renter_id (never trusts a client-
 * supplied HTML/cost breakdown), so nothing but the id needs to be passed.
 */
export async function sendBookingConfirmationEmail(bookingId) {
  const { data, error } = await supabase.functions.invoke('send-booking-confirmation', {
    body: { bookingId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

/**
 * Fires the welcome email (send-welcome-email Edge Function). Idempotent
 * server-side (checks/sets users.welcome_email_sent_at), so this is safe to
 * call every time the post-confirmation screen mounts - a repeat call just
 * returns { skipped: true } instead of sending twice.
 */
export async function sendWelcomeEmail() {
  const { data, error } = await supabase.functions.invoke('send-welcome-email', { body: {} });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

/**
 * Notifies the vendor a new booking needs their review (send-booking-
 * request-vendor Edge Function) - best-effort, same fire-and-forget spirit
 * as sendBookingConfirmationEmail.
 */
export async function sendBookingRequestVendorEmail(bookingId) {
  const { data, error } = await supabase.functions.invoke('send-booking-request-vendor', {
    body: { bookingId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

/**
 * Notifies renter, vendor, and admin/support that a booking was cancelled
 * (send-booking-cancelled Edge Function) - best-effort. Callable by the
 * renter, the vendor, or an admin, since all three are legitimate
 * cancellation initiators.
 */
export async function sendBookingCancelledEmail(bookingId, reason) {
  const { data, error } = await supabase.functions.invoke('send-booking-cancelled', {
    body: { bookingId, reason },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

/**
 * Sends the real "Booking Confirmed" email (send-booking-confirmed Edge
 * Function) - distinct from sendBookingConfirmationEmail above, which
 * actually sends "Booking Received" (payment time, before anyone has agreed
 * to fulfill the trip). This one fires once the booking is genuinely
 * confirmed - callable by the vendor who owns it (services/
 * vendorBookingsApi.js's acceptBookingRequest) or an admin (services/
 * adminBookingsApi.js's confirmBooking). Best-effort, same fire-and-forget
 * spirit as the other booking emails.
 */
export async function sendBookingConfirmedEmail(bookingId) {
  const { data, error } = await supabase.functions.invoke('send-booking-confirmed', {
    body: { bookingId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}
