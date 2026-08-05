import supabase from './supabase';

const VERIFICATION_TYPES = ['license_front', 'license_back', 'proof_of_address'];
const SIGNED_URL_TTL_SECONDS = 3600;

async function signedUrlFor(filePath) {
  if (!filePath) return null;
  const { data } = await supabase.storage.from('documents').createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

/**
 * A specific user's latest license_front/license_back/proof_of_address,
 * for admin review - used by both the admin booking detail screen (via
 * the booking's renter_id) and the admin user detail screen (via the
 * profile being viewed). Admin-only: relies on documents_admin_all's
 * is_admin() RLS policy (both the `documents` table and the `documents`
 * storage bucket) to read any user's rows/files, not just the caller's
 * own - a non-admin calling this gets nothing back, same silent-empty
 * behavior as any other RLS-filtered read in this app.
 */
export async function getUserVerificationDocuments(userId) {
  const { data, error } = await supabase
    .from('documents')
    .select('type, file_path, created_at')
    .eq('user_id', userId)
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
      return [type, { signedUrl: await signedUrlFor(row.file_path), uploadedAt: row.created_at }];
    })
  );
  return Object.fromEntries(entries);
}
