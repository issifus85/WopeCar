import supabase from './supabase';
import { notifyUser } from './adminNotify';

function notifyVendorApplicationStatus(payload) {
  supabase.functions.invoke('send-vendor-application-status', { body: payload }).catch(() => {});
}

const VENDOR_SELECT = `
  id, user_id, business_name, ghana_card_id, bank_name, bank_account,
  total_earnings, is_approved, created_at,
  id_document_status, id_document_rejection_reason,
  business_reg_document_status, business_reg_document_rejection_reason,
  users ( full_name, email, phone )
`;

const DOC_TYPES = ['vendor_id_front', 'vendor_id_back', 'vendor_business_reg'];
const SIGNED_URL_TTL_SECONDS = 3600;

/** Pending or approved vendor list - two tabs, one query each. */
export async function listVendors({ approved }) {
  const { data, error } = await supabase
    .from('vendors')
    .select(VENDOR_SELECT)
    .eq('is_approved', approved)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Approved-vendor stats (active cars, total bookings) - not stored columns,
 * computed on demand. total_earnings IS a stored column already (updated
 * elsewhere, e.g. a future payout flow), so that one's just read straight
 * off the row.
 */
export async function getVendorStats(vendorId) {
  const [cars, bookings] = await Promise.all([
    supabase.from('cars').select('id', { count: 'exact', head: true }).eq('vendor_id', vendorId).eq('status', 'active'),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('vendor_id', vendorId),
  ]);
  if (cars.error) throw cars.error;
  if (bookings.error) throw bookings.error;
  return { activeCars: cars.count ?? 0, totalBookings: bookings.count ?? 0 };
}

/**
 * Manual payout record-keeping - no real money moves here (no Paystack
 * Transfers integration exists yet). Admin is asserting a payout already
 * happened outside the app (bank transfer, etc.) and wants it logged +
 * the vendor notified. Doesn't touch vendors.total_earnings, which tracks
 * gross earnings from bookings, not what's been paid out - those are two
 * different numbers.
 */
export async function recordVendorPayout(vendor, { amount, note }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('vendor_payouts')
    .insert({ vendor_id: vendor.id, amount, note: note || null, created_by: user?.id ?? null })
    .select()
    .single();
  if (error) throw error;

  await notifyUser({
    userId: vendor.user_id,
    type: 'vendor_payout',
    title: 'Payout recorded',
    body: `A payout of GH₵${Math.round(Number(amount))} has been recorded for your account.`,
  });
  supabase.functions.invoke('send-vendor-payout', {
    body: { vendorUserId: vendor.user_id, amount, note },
  }).catch(() => {});

  return data;
}

/**
 * Approve: is_approved=true, and per spec bumps the owning user's role to
 * 'vendor' - confirmed via services/vendorCarsApi.js's applyToBecomeVendor()
 * that applying never touches users.role itself, so this admin approval
 * step really is the only place that promotion happens.
 *
 * Also writes application_status='approved' (+ clears rejection_reason) -
 * the web dashboard's Pending tab filters on application_status, not
 * is_approved (lib/api/vendors.ts's listPendingVendors). Before this, a
 * vendor approved here kept application_status='pending' forever (its
 * insert-time default - see vendorCarsApi.js's applyToBecomeVendor, which
 * never sets it either), so it would never leave the web dashboard's
 * Pending tab despite being live and able to list cars. Confirmed via a
 * live query that all vendors approved so far happened to go through a
 * path that set both columns, so this had not yet manifested for a real
 * vendor - but it's a real bug for the next mobile-side approval.
 */
export async function approveVendor(vendor) {
  const { data, error } = await supabase
    .from('vendors')
    .update({ is_approved: true, application_status: 'approved', rejection_reason: null })
    .eq('id', vendor.id)
    .select()
    .single();
  if (error) throw error;

  if (vendor.user_id) {
    const { error: roleError } = await supabase.from('users').update({ role: 'vendor' }).eq('id', vendor.user_id);
    if (roleError) throw roleError;
  }

  await notifyUser({
    userId: vendor.user_id,
    type: 'vendor_approved',
    title: 'Your vendor application was approved',
    body: `${vendor.business_name || 'Your business'} is now approved on WopeCar. You can start listing cars.`,
  });
  notifyVendorApplicationStatus({ vendorUserId: vendor.user_id, businessName: vendor.business_name, approved: true });

  return data;
}

/**
 * Reject: hard-deletes the row (unlike the web dashboard's rejectVendor,
 * which soft-rejects and keeps it) - deliberately, not an oversight. The
 * mobile app has no concept of a 'rejected' vendor anywhere else: apply.js
 * treats "a vendors row exists for me" as "I've already applied" and
 * redirects straight into Vendor Mode, and the vendors_user_id_unique
 * constraint means a leftover rejected row would permanently block
 * reapplication (or silently resurrect the stale rejected data instead of
 * accepting a fresh submission) unless apply.js's reapply path were also
 * rebuilt to detect and revive a rejected row. Until that's done, deleting
 * here is what keeps "reject then reapply" working.
 */
export async function rejectVendor(vendor, reason) {
  const { error } = await supabase.from('vendors').delete().eq('id', vendor.id);
  if (error) throw error;

  await notifyUser({
    userId: vendor.user_id,
    type: 'vendor_rejected',
    title: 'Your vendor application was not approved',
    body: reason || 'Your application did not meet our current requirements.',
  });
  notifyVendorApplicationStatus({ vendorUserId: vendor.user_id, businessName: vendor.business_name, approved: false, reason });
}

/**
 * Signed preview URLs for a vendor's latest upload of each verification doc
 * type - relies on documents_admin_all (table) and the storage bucket's own
 * documents_admin_all policy, both already granting admins full access to
 * every vendor's uploads, not just their own.
 */
export async function getVendorDocuments(vendorUserId) {
  const { data, error } = await supabase
    .from('documents')
    .select('type, file_path, created_at')
    .eq('user_id', vendorUserId)
    .in('type', DOC_TYPES)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const latestByType = {};
  (data ?? []).forEach((row) => {
    if (!latestByType[row.type]) latestByType[row.type] = row;
  });

  const entries = await Promise.all(
    DOC_TYPES.map(async (type) => {
      const row = latestByType[type];
      if (!row) return [type, null];
      const { data: signed } = await supabase.storage
        .from('documents')
        .createSignedUrl(row.file_path, SIGNED_URL_TTL_SECONDS);
      return [type, signed?.signedUrl ?? null];
    })
  );
  return Object.fromEntries(entries);
}

/**
 * Verify or reject one of a vendor's two document groups ('id' - the Ghana
 * Card front+back pair - or 'business_reg'). Always notifies the vendor,
 * same as every other admin decision in this file.
 */
export async function setVendorDocumentStatus(vendor, docKey, status, reason) {
  const statusColumn = docKey === 'business_reg' ? 'business_reg_document_status' : 'id_document_status';
  const reasonColumn = docKey === 'business_reg' ? 'business_reg_document_rejection_reason' : 'id_document_rejection_reason';
  const docLabel = docKey === 'business_reg' ? 'business registration document' : 'identity document';

  const { data, error } = await supabase
    .from('vendors')
    .update({ [statusColumn]: status, [reasonColumn]: status === 'rejected' ? (reason || null) : null })
    .eq('id', vendor.id)
    .select()
    .single();
  if (error) throw error;

  await notifyUser({
    userId: vendor.user_id,
    type: status === 'verified' ? 'vendor_document_verified' : 'vendor_document_rejected',
    title: status === 'verified' ? 'A document was verified' : 'A document needs attention',
    body: status === 'verified'
      ? `Your ${docLabel} has been verified.`
      : (reason || `Your ${docLabel} was not approved. Please re-upload it.`),
  });
  supabase.functions.invoke('send-vendor-document-status', {
    body: { vendorUserId: vendor.user_id, docLabel, verified: status === 'verified', reason },
  }).catch(() => {});

  return data;
}
