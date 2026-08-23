import supabase, { getCurrentUser } from './supabase';

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
export async function syncInspection(bookingId, { type, mileage, fuelLevel, checklist, damagePoints }) {
  const { data: inspection, error } = await supabase
    .from('vehicle_inspections')
    .upsert(
      {
        booking_id: bookingId,
        type,
        mileage: mileage === '' || mileage == null ? null : Number(mileage),
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

const REQUIRED_ANGLES = ['front', 'back', 'left', 'right', 'odometer'];

/**
 * Validates the same completeness requirements Laravel enforced server-side
 * before generating its PDF (all 5 photos + both signatures) - there's no
 * PDF anymore, but the underlying "is this inspection actually complete"
 * contract should stay the same.
 */
export async function submitInspection(inspectionId) {
  const inspection = await fetchById(inspectionId);
  if (!inspection) throw new Error('Inspection not found.');

  const hasAllPhotos = REQUIRED_ANGLES.every((angle) => inspection.photos.some((p) => p.angle === angle));
  if (!hasAllPhotos) throw new Error('All 5 photos are required before submitting.');
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
