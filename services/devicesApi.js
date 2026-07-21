import { request } from './api';

/**
 * Adapts a raw user_login_activities row to what the app's UI expects,
 * mirroring the camelCase-mapping convention normalizeUser()/normalizeCar()
 * already use elsewhere in this services/ folder.
 */
function normalizeDevice(raw) {
  return {
    id: raw.id,
    ipAddress: raw.ip_address,
    userAgent: raw.user_agent,
    isTrusted: !!raw.is_trusted,
    isNewDevice: !!raw.is_new_device,
    isCurrent: !!raw.is_current,
    loginAt: raw.login_at,
    lastActiveAt: raw.last_active_at,
    revokedAt: raw.revoked_at,
  };
}

/**
 * GET /api/devices - Active Devices: non-revoked sessions only.
 */
export async function getDevices() {
  const json = await request('/devices', { auth: true });
  return json.data.map(normalizeDevice);
}

/**
 * GET /api/devices/history - Login Activity: every recorded login,
 * including revoked ones, newest first.
 */
export async function getLoginActivity() {
  const json = await request('/devices/history', { auth: true });
  return json.data.map(normalizeDevice);
}

/**
 * POST /api/devices/{id}/revoke - signs a device out (deletes its Sanctum
 * token server-side).
 */
export async function revokeDevice(id) {
  return request(`/devices/${id}/revoke`, { method: 'POST', auth: true });
}

/**
 * POST /api/devices/{id}/trust
 */
export async function trustDevice(id) {
  const json = await request(`/devices/${id}/trust`, { method: 'POST', auth: true });
  return normalizeDevice(json.data);
}

/**
 * POST /api/devices/{id}/untrust
 */
export async function untrustDevice(id) {
  const json = await request(`/devices/${id}/untrust`, { method: 'POST', auth: true });
  return normalizeDevice(json.data);
}
