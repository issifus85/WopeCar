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
    clientSignaturePath: row.client_signature_path ?? null,
    representativeSignaturePath: row.representative_signature_path ?? null,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at ?? null,
    /** Who created the draft (auth user id) - an admin when it was initiated from the admin booking details. */
    initiatedBy: row.initiated_by ?? null,
    reportPdfPath: row.report_pdf_path ?? null,
  };
}

/**
 * A short-lived signed URL for a stored signature image, or null when the
 * viewer can't read it (the documents bucket is private: the renter and
 * admins can, a vendor can't - callers fall back to a "signed" tick).
 */
export async function getRentalAgreementSignatureUrl(path) {
  if (!path) return null;
  const { data } = await supabase.storage.from('documents').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
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
 * ADMIN: start the Client Rental Agreement for a booking. The draft is saved on the server right away, prefilled from the booking (lessee,
 * vehicle, rate, deposit, dates and times), so it exists for both the admin and the renter before anything is typed - it is only SUBMITTED
 * later, when the agreement is completed. Never overwrites an existing agreement (returns it as is). The vehicle registration, colour and
 * year are not stored on the car, so they are left for the admin to fill in.
 */
export async function startRentalAgreementForBooking(bookingId) {
  const existing = await getRentalAgreement(bookingId);
  if (existing) return existing;

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, start_date, end_date, pickup_time, return_time, security_deposit, cars ( make, model, price_per_day ), renter:users!bookings_renter_id_fkey ( full_name )')
    .eq('id', bookingId)
    .single();
  if (bookingError) throw bookingError;

  const car = Array.isArray(booking.cars) ? booking.cars[0] : booking.cars;
  const renter = Array.isArray(booking.renter) ? booking.renter[0] : booking.renter;
  const row = {
    booking_id: bookingId,
    status: 'draft',
    lessee_name: renter?.full_name || null,
    vehicle_make: [car?.make, car?.model].filter(Boolean).join(' ') || null,
    daily_rate: car?.price_per_day ?? null,
    security_deposit: booking.security_deposit ?? null,
    duration_start: booking.start_date ? String(booking.start_date).slice(0, 10) : null,
    duration_end: booking.end_date ? String(booking.end_date).slice(0, 10) : null,
    pickup_time: booking.pickup_time || null,
    return_time: booking.return_time || null,
    ghana_only_use: true,
  };
  const { data, error } = await supabase.from('rental_agreements').insert(row).select().single();
  if (error) {
    // Someone else (the renter, another admin) created it a moment ago - use theirs.
    if (error.code === '23505') {
      const raced = await getRentalAgreement(bookingId);
      if (raced) return raced;
    }
    throw error;
  }
  return normalizeAgreement(data);
}

/**
 * Generates the PDF copy + emails it to the renter and WopeCar once the agreement is submitted. Fire-and-forget: a failure here must never
 * block the confirmation the user already earned.
 */
export async function generateRentalAgreementReport(agreementId) {
  const { error } = await supabase.functions.invoke('generate-rental-agreement-report', { body: { agreementId } });
  if (error) throw error;
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

  // Already submitted (a retry, or the other party - client or admin - finished it first): nothing left to do.
  if (row.status === 'submitted') return normalizeAgreement(row);

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
