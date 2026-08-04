import supabase from './supabase';

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

export async function verifyUser(id) {
  const { data, error } = await supabase.from('users').update({ is_verified: true }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

/** role='suspended' rather than a delete - fully reversible via changeUserRole. */
export async function suspendUser(id) {
  const { data, error } = await supabase.from('users').update({ role: 'suspended' }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function changeUserRole(id, role) {
  const { data, error } = await supabase.from('users').update({ role }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
