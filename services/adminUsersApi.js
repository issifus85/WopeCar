import supabase from './supabase';
import { notifyUser } from './adminNotify';

const PAGE_SIZE = 50;

/**
 * Paginated, filtered, searched user list. Deliberately not `select('*')`
 * across all ~4,760 users at once - filter is a plain role match (or 'all'),
 * search does a server-side ilike across name/email so the client never
 * pages through rows just to throw most of them away.
 */
export async function listUsers({ filter = 'all', search = '', page = 0 } = {}) {
  let query = supabase
    .from('users')
    .select('id, email, full_name, phone, avatar_url, role, is_verified, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (filter !== 'all') {
    query = query.eq('role', filter);
  }
  if (search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`full_name.ilike.${term},email.ilike.${term}`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { users: data ?? [], total: count ?? 0, hasMore: (page + 1) * PAGE_SIZE < (count ?? 0) };
}

/** Counts per role tab, run once (not per-page) to label FilterTabs. */
export async function getUserRoleCounts() {
  const roles = ['renter', 'vendor', 'admin'];
  const results = await Promise.all(
    roles.map((role) => supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', role))
  );
  for (const r of results) if (r.error) throw r.error;
  return {
    all: results.reduce((sum, r) => sum + (r.count ?? 0), 0),
    renter: results[0].count ?? 0,
    vendor: results[1].count ?? 0,
    admin: results[2].count ?? 0,
  };
}

/** Full profile for the User Detail modal - the extended field set. */
export async function getUserDetail(id) {
  const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// Notification copy on all three below matches the web dashboard's
// lib/api/users.ts exactly - same wording either surface uses this from.
export async function verifyUser(id) {
  const { data, error } = await supabase.from('users').update({ is_verified: true }).eq('id', id).select().single();
  if (error) throw error;
  await notifyUser({
    userId: id,
    type: 'account_verified',
    title: 'Your account is verified',
    body: 'An administrator has verified your WopeCar account.',
  });
  return data;
}

/** role='suspended' rather than a delete - fully reversible via changeUserRole. */
export async function suspendUser(id) {
  const { data, error } = await supabase.from('users').update({ role: 'suspended' }).eq('id', id).select().single();
  if (error) throw error;
  await notifyUser({
    userId: id,
    type: 'account_suspended',
    title: 'Account suspended',
    body: 'Your WopeCar account has been suspended by an administrator. Contact support for details.',
  });
  return data;
}

const USER_STATUS_COLUMN = { license: 'license_verification_status', national_id: 'national_id_status' };
// Driver's licence has no rejection-reason column (0005_extend_users_profile.sql).
const USER_REASON_COLUMN = { license: null, national_id: 'national_id_rejection_reason' };
const USER_DOC_LABEL = { license: "driver's licence", national_id: 'national ID' };

/**
 * Verify or reject a user's driver's licence or national ID - same real
 * pattern as the web admin's setUserVerificationStatus()
 * (wopecar-admin/lib/api/documents.ts): status+reason column update,
 * notification insert, fire-and-forget send-id-verification-status email.
 * Previously license_verification_status was only ever displayed as plain
 * read-only text in UserDetailModal, with no action anywhere that could
 * actually change it.
 */
export async function setUserVerificationStatus(id, field, status, reason) {
  const reasonColumn = USER_REASON_COLUMN[field];
  const updates = { [USER_STATUS_COLUMN[field]]: status };
  if (reasonColumn) updates[reasonColumn] = status === 'rejected' ? reason || null : null;

  const { data, error } = await supabase.from('users').update(updates).eq('id', id).select().single();
  if (error) throw error;

  const docLabel = USER_DOC_LABEL[field];
  await notifyUser({
    userId: id,
    type: status === 'verified' ? 'id_document_verified' : 'id_document_rejected',
    title: status === 'verified' ? 'A document was verified' : 'A document needs attention',
    body: status === 'verified' ? `Your ${docLabel} has been verified.` : reason || `Your ${docLabel} was not approved. Please re-upload it.`,
  });
  await supabase.functions
    .invoke('send-id-verification-status', { body: { userId: id, docLabel, verified: status === 'verified', reason } })
    .catch(() => {});

  return data;
}

export async function changeUserRole(id, role) {
  const { data, error } = await supabase.from('users').update({ role }).eq('id', id).select().single();
  if (error) throw error;
  await notifyUser({
    userId: id,
    type: 'account_role_changed',
    title: 'Your account role changed',
    body: `An administrator changed your account role to ${role}.`,
  });
  return data;
}
