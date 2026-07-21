import { request } from './api';

/**
 * DELETE /api/account
 * Requires auth:sanctum + re-entering the current password. The server
 * revokes every Sanctum token on success, so the caller should clear the
 * locally stored token right after this resolves (see
 * AuthContext.deleteAccount).
 */
export async function deleteAccount(password) {
  return request('/account', {
    method: 'DELETE',
    auth: true,
    body: { password },
  });
}

/**
 * GET /api/account/export
 * Returns the user's own profile + bookings as one raw payload - this is a
 * one-off data dump the user shares/saves, not app state, so it's returned
 * as-is rather than run through normalizeUser()/normalizeBooking().
 */
export async function exportData() {
  const json = await request('/account/export', { auth: true });
  return json.data;
}

/**
 * GET /api/account/security-alerts
 */
export async function getSecurityAlerts() {
  const json = await request('/account/security-alerts', { auth: true });
  return json.data.enabled;
}

/**
 * PUT /api/account/security-alerts
 */
export async function updateSecurityAlerts(enabled) {
  const json = await request('/account/security-alerts', {
    method: 'PUT',
    auth: true,
    body: { enabled },
  });
  return json.data.enabled;
}
