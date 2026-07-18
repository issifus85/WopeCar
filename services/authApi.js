import { request } from './api';
import { setToken, clearToken } from './tokenStorage';

/**
 * POST /api/auth/register
 * Stores the returned token on success. Throws ApiError (status 422) with
 * .errors on validation failure.
 */
export async function register({ name, email, password, passwordConfirmation }) {
  const json = await request('/auth/register', {
    method: 'POST',
    body: {
      name,
      email,
      password,
      password_confirmation: passwordConfirmation,
    },
  });
  await setToken(json.data.token);
  return json.data.user;
}

/**
 * POST /api/auth/login
 * Stores the returned token on success. Throws ApiError (status 401/403)
 * on invalid credentials or a blocked account.
 */
export async function login({ email, password }) {
  const json = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  await setToken(json.data.token);
  return json.data.user;
}

/**
 * POST /api/auth/logout
 * Revokes the token server-side, then clears it locally regardless of
 * whether the request succeeds (e.g. token already expired).
 */
export async function logout() {
  try {
    await request('/auth/logout', { method: 'POST', auth: true });
  } finally {
    await clearToken();
  }
}

/**
 * GET /api/user
 * Returns the current user from a stored token, or null if there isn't one
 * / it's no longer valid.
 */
export async function getCurrentUser() {
  try {
    return await request('/user', { auth: true });
  } catch (error) {
    if (error.status === 401) return null;
    throw error;
  }
}
