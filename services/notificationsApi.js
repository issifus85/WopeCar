import { request } from './api';

function normalizeServerNotification(raw) {
  return {
    id: raw.id,
    type: raw.type,
    title: raw.title,
    body: raw.body ?? '',
    bookingId: raw.booking_id ?? null,
    conversationId: raw.conversation_id ?? null,
    readAt: raw.read_at ?? null,
    createdAt: raw.created_at,
  };
}

/**
 * GET /api/notifications - the caller's own cross-account notifications
 * (e.g. a host's "new booking" alert). Merged into InboxContext's existing
 * local notification feed - see InboxContext.js::syncServerNotifications.
 */
export async function getServerNotifications() {
  const json = await request('/notifications', { auth: true });
  return json.data.map(normalizeServerNotification);
}

/**
 * POST /api/notifications/{id}/read
 */
export async function markNotificationRead(id) {
  return request(`/notifications/${id}/read`, { method: 'POST', auth: true });
}
