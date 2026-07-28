import { request, ApiError } from './api';
import { buildFilePart } from './mediaUpload';

function normalizeAgreement(raw) {
  return {
    id: raw.id,
    bookingId: raw.bookingId,
    status: raw.status,
    lesseeName: raw.lesseeName ?? '',
    vehicleRegistration: raw.vehicleRegistration ?? '',
    vehicleMake: raw.vehicleMake ?? '',
    vehicleColor: raw.vehicleColor ?? '',
    vehicleYear: raw.vehicleYear ?? '',
    dailyRate: raw.dailyRate ?? '',
    securityDeposit: raw.securityDeposit ?? '',
    durationStart: raw.durationStart ?? '',
    durationEnd: raw.durationEnd ?? '',
    pickupTime: raw.pickupTime ?? '',
    returnTime: raw.returnTime ?? '',
    ghanaOnlyUse: raw.ghanaOnlyUse ?? true,
    hasClientSignature: !!raw.hasClientSignature,
    hasRepresentativeSignature: !!raw.hasRepresentativeSignature,
    submittedAt: raw.submittedAt,
    document: raw.document ? { id: raw.document.id, signedUrl: raw.document.signedUrl } : null,
  };
}

/**
 * GET /api/bookings/{bookingId}/rental-agreement - null (not a thrown
 * error) when none exists yet, matching getInspection()'s "Not Started"
 * convention for Booking Detail's entry point.
 */
export async function getRentalAgreement(bookingId) {
  try {
    const json = await request(`/bookings/${bookingId}/rental-agreement`, { auth: true });
    return normalizeAgreement(json.data);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/**
 * POST /api/bookings/{bookingId}/rental-agreement - the autosave target,
 * called (debounced) on every field change. Only the fields present in
 * `fields` are sent - callers pass just what changed, not the whole draft,
 * since this form has no offline-resume-friendly "whole draft" requirement
 * the way the multi-step Inspection wizard does.
 */
export async function saveRentalAgreementDraft(bookingId, fields) {
  const body = {};
  if ('lesseeName' in fields) body.lessee_name = fields.lesseeName || null;
  if ('vehicleRegistration' in fields) body.vehicle_registration = fields.vehicleRegistration || null;
  if ('vehicleMake' in fields) body.vehicle_make = fields.vehicleMake || null;
  if ('vehicleColor' in fields) body.vehicle_color = fields.vehicleColor || null;
  if ('vehicleYear' in fields) body.vehicle_year = fields.vehicleYear || null;
  if ('dailyRate' in fields) body.daily_rate = fields.dailyRate === '' ? null : fields.dailyRate;
  if ('securityDeposit' in fields) body.security_deposit = fields.securityDeposit === '' ? null : fields.securityDeposit;
  if ('durationStart' in fields) body.duration_start = fields.durationStart || null;
  if ('durationEnd' in fields) body.duration_end = fields.durationEnd || null;
  if ('pickupTime' in fields) body.pickup_time = fields.pickupTime || null;
  if ('returnTime' in fields) body.return_time = fields.returnTime || null;
  if ('ghanaOnlyUse' in fields) body.ghana_only_use = fields.ghanaOnlyUse;

  const json = await request(`/bookings/${bookingId}/rental-agreement`, { method: 'POST', auth: true, body });
  return normalizeAgreement(json.data);
}

/**
 * POST /api/rental-agreements/{id}/signatures
 */
export async function uploadRentalAgreementSignature(agreementId, role, uri) {
  const part = await buildFilePart(uri, `${role}-signature.png`);
  const body = new FormData();
  body.append('role', role);
  if (part.blob) body.append('file', part.blob, part.filename);
  else body.append('file', part.native);

  const json = await request(`/rental-agreements/${agreementId}/signatures`, { method: 'POST', auth: true, body });
  return normalizeAgreement(json.data);
}

/**
 * POST /api/rental-agreements/{id}/submit
 */
export async function submitRentalAgreement(agreementId) {
  const json = await request(`/rental-agreements/${agreementId}/submit`, { method: 'POST', auth: true });
  return normalizeAgreement(json.data);
}
