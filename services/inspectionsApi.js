import { request, ApiError } from './api';
import { buildFilePart } from './mediaUpload';

// draft.checklist uses camelCase keys (matching every other piece of frontend
// state), but the backend stores + the PDF template (vir-report.blade.php)
// reads interior_checklist as a plain, unconverted JSON blob - so the keys
// sent over the wire must already be snake_case, and the keys read back must
// be converted back to camelCase for the UI/draft to recognize them.
function checklistToSnakeCase(checklist) {
  if (!checklist) return checklist;
  return Object.fromEntries(
    Object.entries(checklist).map(([key, value]) => [key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), value])
  );
}

function checklistToCamelCase(checklist) {
  if (!checklist) return checklist;
  return Object.fromEntries(
    Object.entries(checklist).map(([key, value]) => [key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), value])
  );
}

function normalizeInspection(raw) {
  return {
    id: raw.id,
    bookingId: raw.bookingId,
    type: raw.type,
    status: raw.status,
    mileage: raw.mileage,
    fuelLevel: raw.fuelLevel,
    checklist: checklistToCamelCase(raw.checklist) ?? null,
    hasRenterSignature: !!raw.hasRenterSignature,
    hasAgentSignature: !!raw.hasAgentSignature,
    photos: (raw.photos ?? []).map((p) => ({
      angle: p.angle,
      latitude: p.latitude != null ? Number(p.latitude) : null,
      longitude: p.longitude != null ? Number(p.longitude) : null,
      capturedAt: p.capturedAt,
    })),
    damagePoints: (raw.damagePoints ?? []).map((d) => ({
      view: d.view,
      xPct: Number(d.xPct),
      yPct: Number(d.yPct),
      damageType: d.damageType,
      note: d.note,
    })),
    submittedAt: raw.submittedAt,
    document: raw.document ? { id: raw.document.id, signedUrl: raw.document.signedUrl } : null,
  };
}

/**
 * GET /api/bookings/{bookingId}/inspections/{type} - null (not a thrown
 * error) when none exists yet, since that's the normal "Not Started" state
 * for Booking Detail's entry point, not a failure.
 */
export async function getInspection(bookingId, type) {
  try {
    const json = await request(`/bookings/${bookingId}/inspections/${type}`, { auth: true });
    return normalizeInspection(json.data);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/**
 * POST /api/bookings/{bookingId}/inspections - create/update the draft.
 * Callers resend the full current draft state each time (matching the
 * offline-resume-friendly "whole draft sync" pattern) - damagePoints fully
 * replaces the server's existing set rather than diffing.
 */
export async function syncInspection(bookingId, { type, mileage, fuelLevel, checklist, damagePoints }) {
  const json = await request(`/bookings/${bookingId}/inspections`, {
    method: 'POST',
    auth: true,
    body: {
      type,
      mileage: mileage === '' ? null : mileage,
      fuel_level: fuelLevel || null,
      checklist: checklistToSnakeCase(checklist),
      damage_points: (damagePoints ?? []).map((d) => ({
        view: d.view,
        x_pct: d.xPct,
        y_pct: d.yPct,
        damage_type: d.damageType,
        note: d.note || null,
      })),
    },
  });
  return normalizeInspection(json.data);
}

/**
 * POST /api/inspections/{id}/photos
 */
export async function uploadInspectionPhoto(inspectionId, angle, uri, { latitude, longitude, capturedAt } = {}) {
  const part = await buildFilePart(uri, `${angle}.jpg`);
  const body = new FormData();
  body.append('angle', angle);
  if (part.blob) body.append('file', part.blob, part.filename);
  else body.append('file', part.native);
  if (latitude != null) body.append('latitude', String(latitude));
  if (longitude != null) body.append('longitude', String(longitude));
  if (capturedAt) body.append('captured_at', capturedAt);

  const json = await request(`/inspections/${inspectionId}/photos`, { method: 'POST', auth: true, body });
  return normalizeInspection(json.data);
}

/**
 * POST /api/inspections/{id}/signatures
 */
export async function uploadInspectionSignature(inspectionId, role, uri) {
  const part = await buildFilePart(uri, `${role}-signature.png`);
  const body = new FormData();
  body.append('role', role);
  if (part.blob) body.append('file', part.blob, part.filename);
  else body.append('file', part.native);

  const json = await request(`/inspections/${inspectionId}/signatures`, { method: 'POST', auth: true, body });
  return normalizeInspection(json.data);
}

/**
 * POST /api/inspections/{id}/submit
 */
export async function submitInspection(inspectionId) {
  const json = await request(`/inspections/${inspectionId}/submit`, { method: 'POST', auth: true });
  return normalizeInspection(json.data);
}
