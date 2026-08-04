import supabase, { getCurrentUser } from './supabase';

function normalizeAgreement(row) {
  if (!row) return null;
  return {
    id: row.id,
    bookingId: row.booking_id,
    status: row.status,
    lesseeName: row.lessee_name ?? '',
    vehicleRegistration: row.vehicle_registration ?? '',
    vehicleMake: row.vehicle_make ?? '',
    vehicleColor: row.vehicle_color ?? '',
    vehicleYear: row.vehicle_year ?? '',
    dailyRate: row.daily_rate ?? '',
    securityDeposit: row.security_deposit ?? '',
    durationStart: row.duration_start ?? '',
    durationEnd: row.duration_end ?? '',
    pickupTime: row.pickup_time ?? '',
    returnTime: row.return_time ?? '',
    ghanaOnlyUse: row.ghana_only_use ?? true,
    hasClientSignature: !!row.client_signature_path,
    hasRepresentativeSignature: !!row.representative_signature_path,
    submittedAt: row.submitted_at,
  };
}

/**
 * null (not a thrown error) when none exists yet, matching getInspection()'s
 * "Not Started" convention for Booking Detail's entry point.
 */
export async function getRentalAgreement(bookingId) {
  const { data, error } = await supabase
    .from('rental_agreements')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (error) throw error;
  return normalizeAgreement(data);
}

/**
 * The autosave target, called (debounced) on every field change. Only the
 * fields present in `fields` are written - callers pass just what changed,
 * not the whole draft. `.upsert(..., {onConflict: 'booking_id'})` translates
 * to `ON CONFLICT (booking_id) DO UPDATE SET <only the columns given>`, so
 * this preserves the original partial-update-per-keystroke contract exactly
 * (unspecified columns are left untouched, not nulled out).
 */
export async function saveRentalAgreementDraft(bookingId, fields) {
  const row = { booking_id: bookingId };
  if ('lesseeName' in fields) row.lessee_name = fields.lesseeName || null;
  if ('vehicleRegistration' in fields) row.vehicle_registration = fields.vehicleRegistration || null;
  if ('vehicleMake' in fields) row.vehicle_make = fields.vehicleMake || null;
  if ('vehicleColor' in fields) row.vehicle_color = fields.vehicleColor || null;
  if ('vehicleYear' in fields) row.vehicle_year = fields.vehicleYear || null;
  if ('dailyRate' in fields) row.daily_rate = fields.dailyRate === '' ? null : fields.dailyRate;
  if ('securityDeposit' in fields) row.security_deposit = fields.securityDeposit === '' ? null : fields.securityDeposit;
  if ('durationStart' in fields) row.duration_start = fields.durationStart || null;
  if ('durationEnd' in fields) row.duration_end = fields.durationEnd || null;
  if ('pickupTime' in fields) row.pickup_time = fields.pickupTime || null;
  if ('returnTime' in fields) row.return_time = fields.returnTime || null;
  if ('ghanaOnlyUse' in fields) row.ghana_only_use = fields.ghanaOnlyUse;

  const { data, error } = await supabase
    .from('rental_agreements')
    .upsert(row, { onConflict: 'booking_id' })
    .select()
    .single();
  if (error) throw error;
  return normalizeAgreement(data);
}

// Signatures reuse the documents storage bucket (0003_storage_policies.sql)
// - documents/<user_id>/agreements/<agreement_id>/... is already covered by
// the existing owner-scoped policy, no new storage policy needed.
async function uploadAgreementFile(agreementId, filename, uri, contentType) {
  const user = await getCurrentUser();
  const arrayBuffer = await fetch(uri).then((res) => res.arrayBuffer());
  const path = `${user.id}/agreements/${agreementId}/${filename}`;
  const { error } = await supabase.storage.from('documents').upload(path, arrayBuffer, { contentType, upsert: true });
  if (error) throw error;
  return path;
}

export async function uploadRentalAgreementSignature(agreementId, role, uri) {
  const filePath = await uploadAgreementFile(agreementId, `${role}-signature.png`, uri, 'image/png');

  const column = role === 'representative' ? 'representative_signature_path' : 'client_signature_path';
  const { data, error } = await supabase
    .from('rental_agreements')
    .update({ [column]: filePath })
    .eq('id', agreementId)
    .select()
    .single();
  if (error) throw error;
  return normalizeAgreement(data);
}

const REQUIRED_FIELDS = ['lessee_name', 'vehicle_registration', 'vehicle_make', 'daily_rate', 'duration_start', 'duration_end'];

/**
 * Validates the same completeness requirements the form screen's own
 * canSubmit already enforces client-side - kept here too so a draft can't
 * be submitted incomplete via any other path.
 */
export async function submitRentalAgreement(agreementId) {
  const { data: row, error: fetchError } = await supabase
    .from('rental_agreements')
    .select('*')
    .eq('id', agreementId)
    .single();
  if (fetchError) throw fetchError;

  const missingField = REQUIRED_FIELDS.some((key) => row[key] === null || row[key] === '');
  if (missingField) throw new Error('Please fill in all required fields before submitting.');
  if (!row.client_signature_path || !row.representative_signature_path) {
    throw new Error('Both signatures are required before submitting.');
  }

  const { data, error } = await supabase
    .from('rental_agreements')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', agreementId)
    .select()
    .single();
  if (error) throw error;
  return normalizeAgreement(data);
}
