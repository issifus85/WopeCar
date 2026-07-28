import { Platform } from 'react-native';
import { request } from './api';
import { setToken, clearToken } from './tokenStorage';

/**
 * Adapts the API's raw user shape (first_name/last_name, driver_license_*,
 * the appended avatar_url/profile_completion/driver_license_number_masked
 * accessors, etc.) to what the app's UI expects.
 */
function normalizeUser(raw) {
  if (!raw) return null;

  return {
    id: raw.id,
    firstName: raw.first_name ?? '',
    lastName: raw.last_name ?? '',
    nickname: raw.nickname ?? '',
    name: raw.name,
    avatar: raw.avatar_url ?? null,
    email: raw.email,
    emailVerified: !!raw.email_verified_at,
    phone: raw.phone ?? '',
    phoneVerified: !!raw.phone_verified_at,
    birthday: raw.birthday ?? null,
    address: raw.address ?? '',
    address2: raw.address2 ?? '',
    city: raw.city ?? '',
    state: raw.state ?? '',
    country: raw.country ?? '',
    zipCode: raw.zip_code ?? '',
    driverLicenseNumberMasked: raw.driver_license_number_masked ?? null,
    driverLicenseExpiry: raw.driver_license_expiry ?? null,
    driverLicenseCountry: raw.driver_license_country ?? '',
    licenseVerificationStatus: raw.license_verification_status ?? 'pending',
    preferredPickupLocation: raw.preferred_pickup_location ?? '',
    emergencyContactName: raw.emergency_contact_name ?? '',
    emergencyContactPhone: raw.emergency_contact_phone ?? '',
    referralCode: raw.referral_code ?? null,
    profileCompletion: raw.profile_completion ?? 0,
    memberSince: raw.created_at ?? null,
    // Mirrors the backend's App\User::isSupportUser() - role_id 1 ("admin",
    // confirmed live) grants Staff Inbox access automatically; is_support
    // stays available as a manual override for a non-admin account.
    isSupport: !!raw.is_support || raw.role_id === 1,
  };
}

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
  return normalizeUser(json.data.user);
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
  return normalizeUser(json.data.user);
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
    const raw = await request('/user', { auth: true });
    return normalizeUser(raw);
  } catch (error) {
    if (error.status === 401) return null;
    throw error;
  }
}

/**
 * POST /api/auth/password
 * Requires auth:sanctum. Throws ApiError (422) with .errors on validation
 * failure (wrong current password, new password too short/mismatched).
 */
export async function changePassword({ currentPassword, newPassword, newPasswordConfirmation }) {
  return request('/auth/password', {
    method: 'POST',
    auth: true,
    body: {
      current_password: currentPassword,
      new_password: newPassword,
      new_password_confirmation: newPasswordConfirmation,
    },
  });
}

/**
 * PUT /api/user
 * Partial update - only pass the fields that changed. Changing email/phone
 * resets their verification status server-side. Throws ApiError (422) with
 * .errors on validation failure (e.g. email already taken).
 */
export async function updateProfile(fields) {
  const json = await request('/user', { method: 'PUT', auth: true, body: fields });
  return normalizeUser(json.data.user);
}

/**
 * POST /api/user/avatar (multipart)
 * `uri` is a local image URI from expo-image-picker (file:// on native,
 * blob:/data: on web - web URIs aren't directly appendable to FormData the
 * way native ones are, so they're re-fetched into a Blob first).
 */
export async function uploadAvatar(uri) {
  const formData = new FormData();

  if (Platform.OS === 'web') {
    const blob = await fetch(uri).then(res => res.blob());
    formData.append('avatar', blob, 'avatar.jpg');
  } else {
    formData.append('avatar', { uri, name: 'avatar.jpg', type: 'image/jpeg' });
  }

  const json = await request('/user/avatar', { method: 'POST', auth: true, body: formData });
  return normalizeUser(json.data.user);
}
