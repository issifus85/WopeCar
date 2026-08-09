import supabase from './supabase';

/**
 * Adapts a raw conversation summary row (from the list_conversations or
 * get_conversation RPCs) to what the app's UI expects, mirroring the
 * camelCase-mapping convention used elsewhere in this services/ folder.
 * Both RPCs already return pinnedSummary/lastMessage as pre-trimmed jsonb
 * matching this shape, so this is mostly pass-through.
 */
function normalizeConversation(raw) {
  return {
    id: raw.id,
    bookingId: raw.booking_id ?? raw.bookingId,
    createdAt: raw.created_at ?? raw.createdAt,
    pinnedSummary: raw.pinned_summary ?? raw.pinnedSummary ?? null,
    lastMessage: raw.last_message ?? raw.lastMessage ?? null,
    unreadCount: raw.unread_count ?? raw.unreadCount ?? 0,
    isResolved: raw.is_resolved ?? raw.isResolved ?? false,
    isUrgent: raw.is_urgent ?? raw.isUrgent ?? false,
    participants: (raw.participants ?? []).map(normalizeParticipant),
  };
}

function normalizeParticipant(raw) {
  return {
    userId: raw.userId,
    name: raw.name,
    avatar: raw.avatar ?? null,
    role: raw.role,
  };
}

function normalizeMessage(raw) {
  return {
    id: raw.id,
    conversationId: raw.conversation_id,
    senderId: raw.sender_id,
    senderName: raw.sender_name,
    senderIsSupport: !!raw.sender_is_support,
    isRead: !!raw.is_read,
    body: raw.body,
    createdAt: raw.created_at,
  };
}

/**
 * list_conversations(p_scope) - default: only conversations the caller
 * participates in. scope:'all' (support-only) lists every conversation,
 * for the Staff Inbox.
 */
export async function getConversations({ scope } = {}) {
  const { data, error } = await supabase.rpc('list_conversations', { p_scope: scope ?? 'mine' });
  if (error) throw error;
  return (data ?? []).map(normalizeConversation);
}

/**
 * create_or_get_inquiry_conversation(p_car_id) - the pre-booking "Inquiry"
 * counterpart to the booking-anchored flow (which creates its conversation
 * via a DB trigger on booking insert, not a client call). Returns the raw
 * conversation id; the RPC itself reuses an existing unresolved inquiry for
 * the same car+caller rather than creating a duplicate every time.
 */
export async function createInquiryConversation(carId) {
  const { data, error } = await supabase.rpc('create_or_get_inquiry_conversation', { p_car_id: carId });
  if (error) throw error;
  return data;
}

/**
 * get_conversation(p_conversation_id) - metadata + pinned summary +
 * participants, no messages.
 */
export async function getConversation(id) {
  const { data, error } = await supabase.rpc('get_conversation', { p_conversation_id: id });
  if (error) throw error;
  return normalizeConversation(data);
}

/**
 * list_conversation_messages(p_conversation_id) - the sinceId param this
 * function used to accept is dropped: no call site ever actually passed it
 * (a delta fetch can't surface another participant's isRead flipping true,
 * since that doesn't mint a new message id - see InboxContext.js's
 * syncMessages comment), so the RPC always returns the full window.
 */
export async function getMessages(id) {
  const { data, error } = await supabase.rpc('list_conversation_messages', { p_conversation_id: id });
  if (error) throw error;
  return (data ?? []).map(normalizeMessage);
}

/**
 * send_conversation_message(p_conversation_id, p_body)
 */
export async function sendMessage(id, body) {
  const { data, error } = await supabase.rpc('send_conversation_message', { p_conversation_id: id, p_body: body });
  if (error) throw error;
  return normalizeMessage(data);
}

/**
 * mark_conversation_read(p_conversation_id)
 */
export async function markConversationRead(id) {
  const { error } = await supabase.rpc('mark_conversation_read', { p_conversation_id: id });
  if (error) throw error;
}

/**
 * set_conversation_flags(p_conversation_id, p_is_resolved, p_is_urgent) -
 * support-only. Either flag may be omitted to leave it unchanged.
 */
export async function setConversationFlags(id, { isResolved, isUrgent } = {}) {
  const { error } = await supabase.rpc('set_conversation_flags', {
    p_conversation_id: id,
    p_is_resolved: isResolved ?? null,
    p_is_urgent: isUrgent ?? null,
  });
  if (error) throw error;
}

/**
 * search_participant_candidates(p_conversation_id, p_query) - support-only.
 */
export async function searchParticipantCandidates(id, q) {
  const { data, error } = await supabase.rpc('search_participant_candidates', { p_conversation_id: id, p_query: q });
  if (error) throw error;
  return (data ?? []).map((raw) => ({ id: raw.id, name: raw.name, avatar: raw.avatar ?? null, email: raw.email }));
}

/**
 * invite_conversation_participant(p_conversation_id, p_user_id) -
 * support-only.
 */
export async function inviteParticipant(id, userId) {
  const { error } = await supabase.rpc('invite_conversation_participant', { p_conversation_id: id, p_user_id: userId });
  if (error) throw error;
}
