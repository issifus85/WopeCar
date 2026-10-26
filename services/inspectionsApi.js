import supabase, { getCurrentUser } from './supabase';
import { PHOTO_ANGLES } from '../constants/inspectionPhotos';

// checklist stays an opaque jsonb blob, matching how Laravel itself treated
// interior_checklist as a plain unconverted JSON blob - no per-key mapping
// needed on either side of the wire, unlike the Laravel version's
// snake_case <-> camelCase conversion (Supabase's jsonb round-trips
// whatever shape the client already uses).
function normalizeInspection(row) {
  if (!row) return null;
  return {
    id: row.id,
    bookingId: row.booking_id,
    type: row.type,
    status: row.status,
    mileage: row.mileage,
    mileageUnit: row.mileage_unit ?? 'km',
    fuelLevel: row.fuel_level,
    checklist: row.checklist ?? null,
    hasRenterSignature: !!row.renter_signature_path,
    hasAgentSignature: !!row.agent_signature_path,
    photos: (row.vehicle_inspection_photos ?? []).map((p) => ({
      angle: p.angle,
      filePath: p.file_path,
      latitude: p.latitude != null ? Number(p.latitude) : null,
      longitude: p.longitude != null ? Number(p.longitude) : null,
      capturedAt: p.captured_at,
    })),
    damagePoints: (row.vehicle_inspection_damage_points ?? []).map((d) => ({
      view: d.view,
      xPct: Number(d.x_pct),
      yPct: Number(d.y_pct),
      damageType: d.damage_type,
      note: d.note,
    })),
    submittedAt: row.submitted_at,
  };
}

const SELECT_WITH_CHILDREN = '*, vehicle_inspection_photos(*), vehicle_inspection_damage_points(*)';

async function fetchById(inspectionId) {
  const { data, error } = await supabase
    .from('vehicle_inspections')
    .select(SELECT_WITH_CHILDREN)
    .eq('id', inspectionId)
    .single();
  if (error) throw error;
  return normalizeInspection(data);
}

// Photos/signatures reuse the documents storage bucket
// (0003_storage_policies.sql) - its RLS already permits any path under
// documents/<user_id>/..., so no new storage policy was needed for this
// feature. upsert:true so a retake/re-sign cleanly overwrites the same slot.
async function uploadInspectionFile(inspectionId, filename, uri, contentType) {
  const user = await getCurrentUser();
  const arrayBuffer = await fetch(uri).then((res) => res.arrayBuffer());
  const path = `${user.id}/inspections/${inspectionId}/${filename}`;
  const { error } = await supabase.storage.from('documents').upload(path, arrayBuffer, { contentType, upsert: true });
  if (error) throw error;
  return path;
}

/**
 * null (not a thrown error) when none exists yet, since that's the normal
 * "Not Started" state for Booking Detail's entry point, not a failure -
 * same convention the old 404-catch provided.
 */
export async function getInspection(bookingId, type) {
  const { data, error } = await supabase
    .from('vehicle_inspections')
    .select(SELECT_WITH_CHILDREN)
    .eq('booking_id', bookingId)
    .eq('type', type)
    .maybeSingle();
  if (error) throw error;
  return normalizeInspection(data);
}

/**
 * Create/update the draft. Callers resend the full current draft state each
 * time (matching the offline-resume-friendly "whole draft sync" pattern) -
 * damagePoints fully replaces the server's existing set rather than
 * diffing, same contract as the Laravel version.
 */
export async function syncInspection(bookingId, { type, mileage, mileageUnit, fuelLevel, checklist, damagePoints }) {
  const { data: inspection, error } = await supabase
    .from('vehicle_inspections')
    .upsert(
      {
        booking_id: bookingId,
        type,
        mileage: mileage === '' || mileage == null ? null : Number(mileage),
        mileage_unit: mileageUnit === 'mi' ? 'mi' : 'km',
        fuel_level: fuelLevel || null,
        checklist: checklist ?? {},
      },
      { onConflict: 'booking_id,type' }
    )
    .select()
    .single();
  if (error) throw error;

  const { error: deleteError } = await supabase
    .from('vehicle_inspection_damage_points')
    .delete()
    .eq('inspection_id', inspection.id);
  if (deleteError) throw deleteError;

  const points = (damagePoints ?? []).map((d) => ({
    inspection_id: inspection.id,
    view: d.view,
    x_pct: d.xPct,
    y_pct: d.yPct,
    damage_type: d.damageType,
    note: d.note || null,
  }));
  if (points.length) {
    const { error: insertError } = await supabase.from('vehicle_inspection_damage_points').insert(points);
    if (insertError) throw insertError;
  }

  return fetchById(inspection.id);
}

export async function uploadInspectionPhoto(inspectionId, angle, uri, { latitude, longitude, capturedAt } = {}) {
  const filePath = await uploadInspectionFile(inspectionId, `${angle}.jpg`, uri, 'image/jpeg');

  const { error } = await supabase
    .from('vehicle_inspection_photos')
    .upsert(
      { inspection_id: inspectionId, angle, file_path: filePath, latitude: latitude ?? null, longitude: longitude ?? null, captured_at: capturedAt ?? null },
      { onConflict: 'inspection_id,angle' }
    );
  if (error) throw error;

  return fetchById(inspectionId);
}

export async function uploadInspectionSignature(inspectionId, role, uri) {
  const filePath = await uploadInspectionFile(inspectionId, `signature-${role}.png`, uri, 'image/png');

  const column = role === 'agent' ? 'agent_signature_path' : 'renter_signature_path';
  const { error } = await supabase.from('vehicle_inspections').update({ [column]: filePath }).eq('id', inspectionId);
  if (error) throw error;

  return fetchById(inspectionId);
}

/**
 * The server id of THIS booking's inspection. A locally cached id (the wizard's draft) is only trusted after the server confirms it belongs
 * to this booking and type - a draft left over from another booking made signatures upload onto the wrong inspection and submit then
 * checked that other inspection's photos ("All 15 photos are required"). Falls back to looking the inspection up by booking + type.
 */
export async function verifiedInspectionId(candidateId, bookingId, type) {
  if (candidateId) {
    const { data, error } = await supabase.from('vehicle_inspections').select('id, booking_id, type').eq('id', candidateId).maybeSingle();
    if (error) throw error;
    if (data && String(data.booking_id) === String(bookingId) && data.type === type) return data.id;
  }
  const existing = await getInspection(bookingId, type);
  return existing?.id ?? null;
}

const REQUIRED_ANGLES = PHOTO_ANGLES.map((a) => a.key);

/**
 * Photos upload one by one as they are captured, and a failed upload is only remembered as pendingSync - the tile still shows as
 * captured from the local copy. So an inspection can reach the signatures step with photos that never reached the server, and
 * submitInspection() then refuses ("All 15 photos are required"). Before submitting, upload whatever the server does not have yet from
 * the device's local copies (angle -> local uri, as kept in the inspection draft).
 */
export async function uploadMissingInspectionPhotos(inspectionId, localPhotos) {
  const inspection = await fetchById(inspectionId);
  const onServer = new Set((inspection?.photos ?? []).map((p) => p.angle));
  for (const angle of REQUIRED_ANGLES) {
    const uri = localPhotos?.[angle];
    if (uri && !onServer.has(angle)) {
      await uploadInspectionPhoto(inspectionId, angle, uri, { capturedAt: new Date().toISOString() });
    }
  }
}

/**
 * Validates the same completeness requirements Laravel enforced server-side
 * before generating its PDF (all required photos + both signatures) - a
 * later feature brought PDF generation back (see generate-inspection-report),
 * but the underlying "is this inspection actually complete" contract stays
 * the same, now checked against the current 15-photo set.
 */
export async function submitInspection(inspectionId) {
  const inspection = await fetchById(inspectionId);
  if (!inspection) throw new Error('Inspection not found.');
  // Already submitted (a retry, or another party - client or admin - finished it first): nothing left to do.
  if (inspection.status === 'submitted') return inspection;

  const hasAllPhotos = REQUIRED_ANGLES.every((angle) => inspection.photos.some((p) => p.angle === angle));
  if (!hasAllPhotos) throw new Error(`All ${REQUIRED_ANGLES.length} photos are required before submitting.`);
  if (!inspection.hasRenterSignature || !inspection.hasAgentSignature) {
    throw new Error('Both signatures are required before submitting.');
  }

  const { error } = await supabase
    .from('vehicle_inspections')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', inspectionId);
  if (error) throw error;

  return fetchById(inspectionId);
}

/**
 * Generates the PDF report + sends it to renter/vendor/admin. Call
 * fire-and-forget right after submitInspection() succeeds - a failure here
 * must never block the confirmation the user already earned by completing
 * the wizard (mirrors createCalendarAppointment's fire-and-forget shape).
 */
export async function generateInspectionReport(inspectionId) {
  const { error } = await supabase.functions.invoke('generate-inspection-report', { body: { inspectionId } });
  if (error) throw error;
}
