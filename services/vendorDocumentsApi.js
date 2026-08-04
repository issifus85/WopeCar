import supabase, { getCurrentUser } from './supabase';

const SIGNED_URL_TTL_SECONDS = 3600;
const DOC_TYPES = ['vendor_id_front', 'vendor_id_back', 'vendor_business_reg'];

async function signedUrlFor(filePath) {
  if (!filePath) return null;
  const { data } = await supabase.storage.from('documents').createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

/**
 * Signed preview URLs for this vendor's own latest upload of each doc type -
 * mirrors documentsApi.js's pattern for the renter-side Documents Hub.
 * A re-upload inserts a new `documents` row rather than replacing the old
 * one (a lightweight history), so this only surfaces the newest per type.
 */
export async function getMyVendorDocuments() {
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from('documents')
    .select('id, type, file_path, created_at')
    .eq('user_id', user.id)
    .in('type', DOC_TYPES)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const latestByType = {};
  (data ?? []).forEach((row) => {
    if (!latestByType[row.type]) latestByType[row.type] = row;
  });

  const entries = await Promise.all(
    DOC_TYPES.map(async (type) => [type, latestByType[type] ? await signedUrlFor(latestByType[type].file_path) : null])
  );
  return Object.fromEntries(entries);
}

/**
 * Uploads a vendor verification document to the same 'documents' storage
 * bucket + table the renter-side checkout docs already use (documents_owner_
 * insert/select RLS scopes it to the uploader, documents_admin_all gives
 * admin full access - no policy changes needed for either). Flips the
 * matching vendors row status to 'under_review' and clears any prior
 * rejection reason, since a fresh upload deserves a fresh look. ID front and
 * back share one status (a Ghana Card is one document with two sides), the
 * business registration doc has its own.
 */
export async function uploadVendorDocument(type, uri) {
  const user = await getCurrentUser();
  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(uri);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
  const path = `${user.id}/${type}-${Date.now()}.${ext}`;

  const arrayBuffer = await fetch(uri).then((res) => res.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(path, arrayBuffer, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from('documents').insert({ user_id: user.id, type, file_path: path });
  if (insertError) throw insertError;

  const statusColumn = type === 'vendor_business_reg' ? 'business_reg_document_status' : 'id_document_status';
  const reasonColumn = type === 'vendor_business_reg' ? 'business_reg_document_rejection_reason' : 'id_document_rejection_reason';
  const { error: statusError } = await supabase
    .from('vendors')
    .update({ [statusColumn]: 'under_review', [reasonColumn]: null })
    .eq('user_id', user.id);
  if (statusError) throw statusError;

  return signedUrlFor(path);
}
