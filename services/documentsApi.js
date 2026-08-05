import supabase, { getCurrentUser } from './supabase';

const VERIFICATION_TYPES = ['license_front', 'license_back', 'proof_of_address'];
const CAR_DOCUMENT_TYPES = ['roadworthy', 'insurance'];
const SIGNED_URL_TTL_SECONDS = 3600;

function normalizeDocument(raw) {
  return {
    id: raw.id,
    type: raw.type,
    status: raw.status,
    bookingId: raw.bookingId,
    // Set only for CAR_DOCUMENT_TYPES rows - null for every other document
    // type, same optional-field convention as reportRoute below.
    carId: raw.carId ?? null,
    carName: raw.carName ?? null,
    signedUrl: raw.signedUrl ?? null,
    // In-app navigation target for VIR reports (no external file exists
    // for these - see services/inspectionsApi.js) - null for every other
    // document type, which keeps using signedUrl/Linking.openURL as before.
    reportRoute: raw.reportRoute ?? null,
    createdAt: raw.createdAt,
  };
}

async function signedUrlFor(filePath) {
  if (!filePath) return null;
  const { data } = await supabase.storage.from('documents').createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

async function getVerificationDocs() {
  const { data, error } = await supabase
    .from('documents')
    .select('id, type, file_path, booking_id, created_at')
    .in('type', VERIFICATION_TYPES)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return Promise.all(
    (data ?? []).map(async (row) => normalizeDocument({
      id: row.id,
      type: row.type,
      status: 'uploaded',
      bookingId: row.booking_id,
      signedUrl: await signedUrlFor(row.file_path),
      createdAt: row.created_at,
    }))
  );
}

async function getTripDocs() {
  const { data, error } = await supabase
    .from('rental_agreements')
    .select('id, booking_id, submitted_at')
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => normalizeDocument({
    id: row.id,
    type: 'rental_agreement',
    status: 'submitted',
    bookingId: row.booking_id,
    reportRoute: { pathname: '/rental-agreement/report', params: { bookingId: row.booking_id } },
    createdAt: row.submitted_at,
  }));
}

async function getVirDocs() {
  const { data, error } = await supabase
    .from('vehicle_inspections')
    .select('id, type, booking_id, submitted_at')
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => normalizeDocument({
    id: row.id,
    type: 'vir_report',
    status: 'submitted',
    bookingId: row.booking_id,
    reportRoute: { pathname: '/inspection/report', params: { bookingId: row.booking_id, type: row.type } },
    createdAt: row.submitted_at,
  }));
}

// This user's own uploads across all their cars (vendor's-eye view for the
// Documents Hub) - view-only here, same as trip/vir below; uploading only
// happens once, from the Add Car wizard (see uploadCarDocument).
async function getVehicleDocs() {
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from('documents')
    .select('id, type, file_path, car_id, created_at, cars(name)')
    .eq('user_id', user.id)
    .in('type', CAR_DOCUMENT_TYPES)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return Promise.all(
    (data ?? []).map(async (row) => normalizeDocument({
      id: row.id,
      type: row.type,
      status: 'uploaded',
      carId: row.car_id,
      carName: row.cars?.name ?? null,
      signedUrl: await signedUrlFor(row.file_path),
      createdAt: row.created_at,
    }))
  );
}

/**
 * The current renter's own latest license_front/license_back/proof_of_address
 * - one row per type max, whichever was uploaded most recently regardless of
 * which booking (or no booking) it was uploaded through. Used by checkout
 * (app/checkout/form.js) to auto-populate document fields on a second+
 * booking instead of forcing a re-upload every time; exposes filePath (not
 * just signedUrl) so checkout can reuse the existing file - see
 * supabaseApi.js's linkExistingBookingDocument.
 */
export async function getMyVerificationDocumentsByType() {
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from('documents')
    .select('type, file_path, created_at')
    .eq('user_id', user.id)
    .in('type', VERIFICATION_TYPES)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const latestByType = {};
  (data ?? []).forEach((row) => {
    if (!latestByType[row.type]) latestByType[row.type] = row;
  });

  const entries = await Promise.all(
    VERIFICATION_TYPES.map(async (type) => {
      const row = latestByType[type];
      if (!row) return [type, null];
      return [type, { filePath: row.file_path, signedUrl: await signedUrlFor(row.file_path) }];
    })
  );
  return Object.fromEntries(entries);
}

/**
 * Grouped for the Documents Hub's sections. Fully Supabase-native -
 * closes a gap left since Phase 2, where checkout's own uploadBookingDocument()
 * already wrote verification docs to Supabase but this function still read
 * from Laravel's separate /documents endpoint, so those uploads never
 * actually showed up here.
 */
export async function getDocuments() {
  const [verification, trip, vir, vehicle] = await Promise.all([
    getVerificationDocs(), getTripDocs(), getVirDocs(), getVehicleDocs(),
  ]);
  return { verification, trip, vir, vehicle };
}

/**
 * Re-upload a verification document from the Hub directly (e.g. replacing
 * an expired license photo), outside the booking-creation flow. Mirrors
 * supabaseApi.js's uploadBookingDocument() pattern, just without a
 * booking_id (nullable column - a Hub-direct upload isn't tied to one
 * specific booking).
 */
export async function uploadDocument(type, uri) {
  const user = await getCurrentUser();
  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(uri);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
  const path = `${user.id}/${type}-${Date.now()}.${ext}`;

  const arrayBuffer = await fetch(uri).then((res) => res.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(path, arrayBuffer, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('documents')
    .insert({ user_id: user.id, type, file_path: path })
    .select()
    .single();
  if (error) throw error;

  return normalizeDocument({
    id: data.id,
    type: data.type,
    status: 'uploaded',
    bookingId: data.booking_id,
    signedUrl: await signedUrlFor(data.file_path),
    createdAt: data.created_at,
  });
}

/**
 * Roadworthy certificate / insurance policy upload for one car - fired from
 * the Add Car wizard's review step, right after the car itself is created
 * (needs a real car id to attach to). Same bucket/table/path convention as
 * uploadDocument above, just car_id-scoped instead of booking_id-scoped;
 * uses the caller's own uid as the storage path prefix, same as every other
 * document type here - `documents_owner_select`/`_insert` (uploader) and
 * `documents_admin_all` (admin) already cover both parties this needs to be
 * visible to, no new RLS required.
 */
export async function uploadCarDocument(carId, type, uri) {
  const user = await getCurrentUser();
  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(uri);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
  const path = `${user.id}/cars/${carId}/${type}-${Date.now()}.${ext}`;

  const arrayBuffer = await fetch(uri).then((res) => res.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(path, arrayBuffer, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('documents')
    .insert({ user_id: user.id, car_id: carId, type, file_path: path })
    .select()
    .single();
  if (error) throw error;

  return normalizeDocument({
    id: data.id,
    type: data.type,
    status: 'uploaded',
    carId: data.car_id,
    signedUrl: await signedUrlFor(data.file_path),
    createdAt: data.created_at,
  });
}

/**
 * A single car's roadworthy/insurance docs - used by both the vendor's Edit
 * Listing view and admin's Car Detail (documents_owner_select scopes the
 * former to the uploading vendor, documents_admin_all covers the latter).
 * Only the newest upload per type is returned, same "latest wins" rule as
 * services/vendorDocumentsApi.js's getMyVendorDocuments().
 */
export async function getCarDocuments(carId) {
  const { data, error } = await supabase
    .from('documents')
    .select('id, type, file_path, created_at')
    .eq('car_id', carId)
    .in('type', CAR_DOCUMENT_TYPES)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const latestByType = {};
  (data ?? []).forEach((row) => {
    if (!latestByType[row.type]) latestByType[row.type] = row;
  });

  const entries = await Promise.all(
    CAR_DOCUMENT_TYPES.map(async (type) => {
      const row = latestByType[type];
      if (!row) return [type, null];
      return [type, await signedUrlFor(row.file_path)];
    })
  );
  return Object.fromEntries(entries);
}
