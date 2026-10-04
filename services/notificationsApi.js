import supabase from './supabase';

// The notifications table stores `is_read boolean`, not a `read_at`
// timestamp (unlike Laravel's shape). readAt is synthesized as a truthy
// stand-in (created_at when read, null when not) so InboxContext.js's
// existing `!!n.readAt` checks keep working unchanged - it never renders
// the actual timestamp, only checks read/unread.
function normalizeServerNotification(raw) {
  return {
    id: raw.id,
    type: raw.type,
    title: raw.title,
    body: raw.body ?? '',
    bookingId: raw.booking_id ?? null,
    conversationId: raw.conversation_id ?? null,
    readAt: raw.is_read ? raw.created_at : null,
    createdAt: raw.created_at,
  };
}

/**
 * The caller's own cross-account notifications (e.g. a host's "new
 * booking" alert, written by the create_conversation_for_booking()
 * trigger). Merged into InboxContext's existing local notification feed -
 * see InboxContext.js::syncServerNotifications. RLS (notifications_own_select,
 * 0002_rls_policies.sql) already scopes this to the caller's own rows.
 */
export async function getServerNotifications() {
  // RLS alone isn't enough here: admin/support accounts also match the
  // notifications_admin_all policy, so without an explicit user_id filter
  // their inbox (and unread badge) pulled in EVERY user's notifications -
  // each admin saw one copy of the same cancellation per fanned-out
  // recipient, and a count in the thousands.
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, booking_id, conversation_id, is_read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalizeServerNotification);
}

/**
 * Marks a notification read. RLS (notifications_own_update) already scopes
 * this to the caller's own rows.
 */
export async function markNotificationRead(id) {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  if (error) throw error;
}
