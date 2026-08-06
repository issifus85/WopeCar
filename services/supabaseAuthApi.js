import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';
import supabase, { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';

/**
 * Native builds - even an installed Development-Client build connected to a
 * live Metro server, not just Expo Go - must always redirect auth emails to
 * the app's OWN custom scheme (wopecar://...), never wherever
 * Linking.createURL() happens to resolve at that moment. createURL() is
 * dev-server-aware by design (useful for Expo's own hot-reload deep
 * linking), which is exactly wrong here: these links can be opened days
 * later, on a device nowhere near a dev server. Confirmed live - a real
 * tester on a real installed dev-client APK got redirected to
 * http://localhost:8081 (the developer's own machine, unreachable to
 * anyone else) when requesting a password reset. Web keeps using
 * createURL() since there's no custom scheme to fall back to there.
 */
function getAuthRedirectUrl(path) {
  if (Platform.OS === 'web') return Linking.createURL(path);
  const scheme = Constants.expoConfig?.scheme || 'wopecar';
  return `${scheme}://${path}`;
}

// Mirrors services/authApi.js's exact function signatures so
// contexts/AuthContext.js needs (almost) zero changes - see that file for
// the Laravel-backed original this replaces. Full field parity with its
// normalizeUser(), backed by the extended public.users schema (see
// supabase/migrations/0005_extend_users_profile.sql) - nothing here is
// silently dropped to a smaller shape.

/**
 * Same rough intent as Laravel's computed profile_completion percentage -
 * not a stored column (would go stale the moment any of these fields
 * change without also recomputing it), so it's derived here instead, from
 * the same kind of "how much of your profile is actually filled in" signal.
 */
function computeProfileCompletion(profile) {
  const fields = [
    profile.first_name, profile.last_name, profile.phone, profile.avatar_url,
    profile.address, profile.city, profile.country,
    profile.driver_license_number, profile.driver_license_expiry,
    profile.preferred_pickup_location,
  ];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

// Laravel never exposes the raw driver_license_number to the client, only
// a masked accessor - matched here even though (see the migration's
// security note) the column itself isn't encrypted at rest yet, so at
// least the plaintext number never round-trips back out to the UI.
function maskLicenseNumber(number) {
  if (!number) return null;
  const digits = String(number);
  if (digits.length <= 4) return digits;
  return `${'•'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

function normalizeUser(profile) {
  if (!profile) return null;

  return {
    id: profile.id,
    firstName: profile.first_name ?? '',
    lastName: profile.last_name ?? '',
    nickname: profile.nickname ?? '',
    name: profile.full_name ?? '',
    avatar: profile.avatar_url ?? null,
    email: profile.email,
    emailVerified: !!profile.email_verified_at,
    phone: profile.phone ?? '',
    phoneVerified: !!profile.phone_verified_at,
    birthday: profile.birthday ?? null,
    address: profile.address ?? '',
    address2: profile.address2 ?? '',
    city: profile.city ?? '',
    state: profile.state ?? '',
    country: profile.country ?? '',
    zipCode: profile.zip_code ?? '',
    driverLicenseNumberMasked: maskLicenseNumber(profile.driver_license_number),
    driverLicenseExpiry: profile.driver_license_expiry ?? null,
    driverLicenseCountry: profile.driver_license_country ?? '',
    licenseVerificationStatus: profile.license_verification_status ?? 'pending',
    preferredPickupLocation: profile.preferred_pickup_location ?? '',
    emergencyContactName: profile.emergency_contact_name ?? '',
    emergencyContactPhone: profile.emergency_contact_phone ?? '',
    referralCode: profile.referral_code ?? null,
    profileCompletion: computeProfileCompletion(profile),
    memberSince: profile.created_at ?? null,
    isSupport: !!profile.is_support,
    // Additive, not a Laravel field - Supabase-native (Vendor Mode / RLS's
    // is_admin() checks), kept alongside everything above rather than
    // instead of it.
    role: profile.role,
  };
}

/**
 * POST-equivalent of Laravel's /api/auth/register. The public.users row is
 * provisioned by the handle_new_auth_user() trigger (see
 * supabase/migrations/0006_update_signup_trigger.sql), which reads
 * full_name/phone/role straight out of the signup metadata below - nothing
 * here inserts or updates that row directly.
 */
export async function register({ name, email, password, phone, role }) {
  // Same getAuthRedirectUrl() pattern as requestPasswordReset()'s
  // reset-password-callback below - without an explicit emailRedirectTo,
  // Supabase falls back to the project's dashboard-configured Site URL
  // (often an unrelated placeholder), which is what was landing real users
  // on a blank browser page after confirming. This makes the confirmation
  // link redirect straight back into the app instead: app/_layout.js's
  // email-confirmed handling (mirroring its existing reset-password-callback
  // handling) picks it up on both web and native.
  const emailRedirectTo = getAuthRedirectUrl('email-confirmed');
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name, phone, role }, emailRedirectTo },
  });
  if (error) throw error;

  if (!data.session) {
    // Email confirmation is required by this project's Auth settings - the
    // account was created but there is no real session to log the caller
    // into. Throwing (rather than faking a normalized user, which used to
    // make the UI show a signed-in profile that vanished on the next
    // reload/getCurrentUser() check, since no session actually exists) keeps
    // AuthContext's user state truthful.
    throw new Error('Account created! Please check your email to confirm your account, then sign in.');
  }

  return getCurrentUser();
}

/**
 * POST-equivalent of /api/auth/login.
 */
export async function login({ email, password }) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return getCurrentUser();
}

// web: window.open must happen synchronously, before any await - opening
// it after the signInWithOAuth() call below gets silently popup-blocked
// (same constraint services/paystackCheckout.js already documents for the
// Paystack flow). native: expo-web-browser has no such restriction.
function waitForWebPopupRedirect(popup, redirectPrefix) {
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      if (popup.closed) {
        clearInterval(interval);
        reject(new Error('Sign-in was cancelled.'));
        return;
      }
      let currentUrl;
      try {
        currentUrl = popup.location.href;
      } catch {
        return; // Still on the provider's origin - expected, keep polling.
      }
      if (currentUrl.startsWith(redirectPrefix)) {
        clearInterval(interval);
        popup.close();
        resolve(currentUrl);
      }
    }, 500);
  });
}

// Supabase's OAuth callback carries the session in the URL FRAGMENT
// (#access_token=...), not query params.
export function parseTokensFromUrl(url) {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return {};
  const params = new URLSearchParams(url.slice(hashIndex + 1));
  return {
    access_token: params.get('access_token'),
    refresh_token: params.get('refresh_token'),
  };
}

// Same fragment convention as parseTokensFromUrl, for the other thing that
// can land there instead of a token: a link Supabase considers already
// used/expired (most commonly an email security scanner pre-fetching the
// confirmation link before the real user clicks it - see app/email-
// confirmed.js). Falls back to checking the query string too, since exactly
// which one Supabase uses isn't pinned down the same way the success case
// is documented.
export function parseAuthErrorFromUrl(url) {
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const fromHash = hashIndex !== -1 ? new URLSearchParams(url.slice(hashIndex + 1)).get('error_description') : null;
  const fromQuery = queryIndex !== -1 ? new URLSearchParams(url.slice(queryIndex + 1, hashIndex === -1 ? undefined : hashIndex)).get('error_description') : null;
  const description = fromHash || fromQuery;
  return description ? description.replace(/\+/g, ' ') : null;
}

async function performOAuthFlow(provider) {
  const redirectTo = getAuthRedirectUrl('social-callback');

  let webPopup = null;
  if (Platform.OS === 'web') {
    webPopup = window.open('about:blank', '_blank', 'width=500,height=650');
    if (!webPopup) {
      throw new Error('Popup was blocked. Please allow popups for this site.');
    }
  }

  // skipBrowserRedirect: true - without it, the client tries a
  // window.location redirect, which makes no sense in React Native and
  // isn't what we want on web either (we're driving our own popup/browser
  // session instead).
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) {
    webPopup?.close();
    throw error;
  }

  let resultUrl;
  if (Platform.OS === 'web') {
    webPopup.location.href = data.url;
    resultUrl = await waitForWebPopupRedirect(webPopup, redirectTo);
  } else {
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') {
      throw new Error('Sign-in was cancelled.');
    }
    resultUrl = result.url;
  }

  const { access_token, refresh_token } = parseTokensFromUrl(resultUrl);
  if (!access_token || !refresh_token) {
    throw new Error('Sign-in did not return a valid session.');
  }

  const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
  if (sessionError) throw sessionError;

  return getCurrentUser();
}

export const loginWithGoogle = () => performOAuthFlow('google');
export const loginWithFacebook = () => performOAuthFlow('facebook');

/**
 * Sends a password-reset email (Supabase's own recovery flow) - the only
 * way back in for accounts migrated from Laravel, since their bcrypt
 * password hash was never carried over (see supabase/scripts/
 * migrate-remaining-users.mjs). redirectTo mirrors performOAuthFlow's own
 * deep link so app/_layout.js's PASSWORD_RECOVERY handling (web) and
 * Linking listener (native) both recognize it and land the user on
 * app/reset-password.js instead of just silently signing them in.
 */
export async function requestPasswordReset(email) {
  const redirectTo = getAuthRedirectUrl('reset-password-callback');
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

/**
 * Sets a new password using the temporary session a recovery link grants -
 * unlike changePassword() above, this deliberately does NOT verify a
 * "current" password first, since a migrated account has none to verify
 * (that's the entire reason this flow exists).
 */
export async function setPasswordAfterRecovery(newPassword, newPasswordConfirmation) {
  if (newPassword !== newPasswordConfirmation) {
    throw new Error('Passwords do not match.');
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  notifyPasswordChanged();
}

/**
 * POST-equivalent of /api/auth/logout.
 */
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * GET-equivalent of /api/user. Uses getUser() (not getSession()) since it
 * validates the token against the Auth server rather than trusting local
 * storage - same "returns null if the token is no longer valid" behaviour
 * the Laravel version has via its 401 handling.
 */
export async function getCurrentUser() {
  const { data: { user }, error: getUserError } = await supabase.auth.getUser();
  if (getUserError || !user) return null;

  const { data: profile, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!profile) return null;

  return normalizeUser(profile);
}

/**
 * PUT-equivalent of /api/user. Every real call site (app/account.js,
 * app/settings/billing-address.js) already builds `fields` in snake_case
 * matching the table's own columns directly - passed straight through, no
 * case conversion needed.
 *
 * `email` is special-cased: auth.users.email is the actual login identity,
 * not just a profile field, so it goes through supabase.auth.updateUser()
 * too (which sends a confirmation email to the new address - a real,
 * deliberate difference from Laravel's immediate change, since diverging
 * the login email from the displayed profile email would be a genuine bug,
 * not fidelity). The profile row is still updated right away so the UI
 * reflects what was typed, and email_verified_at is reset - matching the
 * "changing email/phone resets verification status" behaviour
 * account.js's docstring already documents.
 */
export async function updateProfile(fields) {
  const { email, ...profileFields } = fields;

  if (email) {
    const { error: authError } = await supabase.auth.updateUser({ email });
    if (authError) throw authError;
  }

  const updates = { ...profileFields };
  if (email) {
    updates.email = email;
    updates.email_verified_at = null;
  }
  if ('phone' in updates) {
    updates.phone_verified_at = null;
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('users').update(updates).eq('id', user.id);
  if (error) throw error;

  return getCurrentUser();
}

/**
 * POST-equivalent of /api/user/avatar. `uri` is a local image URI from
 * expo-image-picker. fetch().arrayBuffer() works for local file:// URIs on
 * both native and web in this Expo SDK - Supabase's own documented
 * approach for Expo avatar uploads, simpler than building a multipart
 * FormData part the way the Laravel version needs to.
 */
export async function uploadAvatar(uri) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const arrayBuffer = await fetch(uri).then((res) => res.arrayBuffer());
  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(uri);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
  // avatars/<user_id>/... - matches the storage RLS policy's folder-
  // ownership convention (supabase/migrations/0003_storage_policies.sql).
  const path = `${user.id}/avatar-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, arrayBuffer, {
      contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

  const { error } = await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', user.id);
  if (error) throw error;

  return getCurrentUser();
}

/**
 * Matches app/settings/change-password.js's exact call shape. Supabase's
 * updateUser({password}) trusts the current session as sufficient proof of
 * identity - it has no "verify current password first" step the way
 * Laravel's endpoint does. Re-verified here first (via a throwaway client,
 * so this sign-in attempt never touches the real session) to keep the same
 * "current password is wrong" validation behaviour the screen already
 * expects.
 */
export async function changePassword({ currentPassword, newPassword, newPasswordConfirmation }) {
  if (newPassword !== newPasswordConfirmation) {
    throw new Error('New passwords do not match.');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error('Not signed in.');

  const verifyClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error: verifyError } = await verifyClient.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) throw new Error('Current password is incorrect.');

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  notifyPasswordChanged();
}

/**
 * Fire-and-forget security notification, shared by changePassword() and
 * setPasswordAfterRecovery() above - both are legitimate "the password just
 * changed" events, so both fire this the same way rather than each screen
 * wiring it separately.
 */
function notifyPasswordChanged() {
  supabase.functions.invoke('send-password-changed', { body: {} }).catch(() => {});
}

/**
 * Matches app/settings/delete-account.js's exact call shape (a single
 * password argument, not an object). Supabase has no client-callable
 * "delete my own account" API - actually deleting the auth.users row needs
 * the service_role key, which must never reach client code. Calls the
 * delete-account Edge Function instead (supabase/functions/delete-account),
 * which verifies identity + password itself, server-side, before using
 * service_role internally. .functions.invoke() automatically attaches the
 * current session's access token as the Authorization header.
 */
export async function deleteAccount(password) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in.');

  const { data, error } = await supabase.functions.invoke('delete-account', {
    body: { password },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  // The edge function already deleted the auth user server-side - signing
  // out locally just clears this device's now-invalid session, same as
  // authApi.js's original clearToken() cleanup after Laravel revokes every
  // Sanctum token.
  await supabase.auth.signOut();
}
