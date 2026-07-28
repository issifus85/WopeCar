import { request } from './api';

/**
 * Adapts a raw conversation summary row (from GET /conversations or
 * /conversations/{id}) to what the app's UI expects, mirroring the
 * camelCase-mapping convention used elsewhere in this services/ folder.
 */
function normalizeConversation(raw) {
  return {
    id: raw.id,
    bookingId: raw.bookingId,
    createdAt: raw.createdAt,
    pinnedSummary: raw.pinnedSummary ?? null,
    lastMessage: raw.lastMessage ?? null,
    unreadCount: raw.unreadCount ?? 0,
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
    conversationId: raw.conversationId,
    senderId: raw.senderId,
    senderName: raw.senderName,
    senderIsSupport: !!raw.senderIsSupport,
    isRead: !!raw.isRead,
    body: raw.body,
    createdAt: raw.createdAt,
  };
}

/**
 * GET /api/conversations - default: only conversations the caller
 * participates in. scope:'all' (support-only) lists every conversation,
 * for the Staff Inbox.
 */
export async function getConversations({ scope } = {}) {
  const query = scope ? `?scope=${scope}` : '';
  const json = await request(`/conversations${query}`, { auth: true });
  return json.data.map(normalizeConversation);
}

/**
 * GET /api/conversations/{id} - metadata + pinned summary + participants,
 * no messages.
 */
export async function getConversation(id) {
  const json = await request(`/conversations/${id}`, { auth: true });
  return normalizeConversation(json.data);
}

/**
 * GET /api/conversations/{id}/messages?since_id=&limit=
 */
export async function getMessages(id, { sinceId, limit } = {}) {
  const params = new URLSearchParams();
  if (sinceId) params.set('since_id', sinceId);
  if (limit) params.set('limit', limit);
  const query = params.toString() ? `?${params.toString()}` : '';
  const json = await request(`/conversations/${id}/messages${query}`, { auth: true });
  return json.data.map(normalizeMessage);
}

/**
 * POST /api/conversations/{id}/messages {body}
 */
export async function sendMessage(id, body) {
  const json = await request(`/conversations/${id}/messages`, {
    method: 'POST',
    auth: true,
    body: { body },
  });
  return normalizeMessage(json.data);
}

/**
 * POST /api/conversations/{id}/read
 */
export async function markConversationRead(id) {
  return request(`/conversations/${id}/read`, { method: 'POST', auth: true });
}

/**
 * GET /api/conversations/{id}/participant-candidates?q= - support-only.
 */
export async function searchParticipantCandidates(id, q) {
  const json = await request(`/conversations/${id}/participant-candidates?q=${encodeURIComponent(q)}`, { auth: true });
  return json.data;
}

/**
 * POST /api/conversations/{id}/participants {user_id} - support-only.
 */
export async function inviteParticipant(id, userId) {
  const json = await request(`/conversations/${id}/participants`, {
    method: 'POST',
    auth: true,
    body: { user_id: userId },
  });
  return normalizeParticipant(json.data);
}
