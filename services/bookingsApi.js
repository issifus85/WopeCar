import { Platform } from 'react-native';
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

// uri is a local picker URI (file:// on native, blob:/data: on web - web
// URIs aren't directly appendable to FormData the way native ones are, so
// they're re-fetched into a Blob first - same fix as
// authApi.js::uploadAvatar()). Extension guess is good enough for the
// backend's 'image' validation rule, which only inspects the actual file
// contents.
async function appendFilePart(formData, fieldName, uri) {
  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(uri);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
  const filename = `${fieldName}.${ext}`;

  if (Platform.OS === 'web') {
    const blob = await fetch(uri).then((res) => res.blob());
    formData.append(fieldName, blob, filename);
  } else {
    formData.append(fieldName, { uri, name: filename, type: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
  }
}

/**
 * POST /api/bookings - creates the real server-side booking row so a
 * messaging conversation can be anchored to it. Callers should treat this
 * as best-effort: the local booking already exists and payment already
 * succeeded by the time this is called, so a failure here must never be
 * allowed to fail checkout.
 *
 * licenseFront/licenseBack/proofOfAddress are optional local picker URIs
 * (from CheckoutContext's draft) - when present they're sent as multipart
 * file fields, matching BookingApiController::store()'s existing
 * license_front/license_back/proof_of_address upload handling.
 */
export async function createBooking({
  carId, startDate, endDate, pickupTime, returnTime,
  pickupLocation, returnLocation, totalCost, addons, paystackReference,
  licenseFront, licenseBack, proofOfAddress,
}) {
  const hasFiles = !!(licenseFront || licenseBack || proofOfAddress);
  // addons is {name, days}[] - sent as two parallel arrays (same index
  // order) rather than nested objects, matching the backend's existing
  // addon_names[] validation shape as closely as possible.
  const addonNames = (addons ?? []).map((a) => a.name);
  const addonDays = (addons ?? []).map((a) => a.days);

  let body;
  if (hasFiles) {
    body = new FormData();
    body.append('car_id', String(carId));
    body.append('start_date', startDate);
    body.append('end_date', endDate);
    body.append('pickup_time', pickupTime);
    body.append('return_time', returnTime);
    body.append('pickup_location', pickupLocation);
    body.append('return_location', returnLocation);
    body.append('total_cost', String(totalCost));
    addonNames.forEach((name) => body.append('addon_names[]', name));
    addonDays.forEach((days) => body.append('addon_days[]', String(days)));
    if (paystackReference) body.append('paystack_reference', paystackReference);
    if (licenseFront) await appendFilePart(body, 'license_front', licenseFront);
    if (licenseBack) await appendFilePart(body, 'license_back', licenseBack);
    if (proofOfAddress) await appendFilePart(body, 'proof_of_address', proofOfAddress);
  } else {
    body = {
      car_id: carId,
      start_date: startDate,
      end_date: endDate,
      pickup_time: pickupTime,
      return_time: returnTime,
      pickup_location: pickupLocation,
      return_location: returnLocation,
      total_cost: totalCost,
      addon_names: addonNames,
      addon_days: addonDays,
      paystack_reference: paystackReference,
    };
  }

  const json = await request('/bookings', { method: 'POST', auth: true, body });
  return normalizeBookingPayment(json.data);
}
