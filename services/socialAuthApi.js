import { request } from './api';

/**
 * GET /api/auth/social/{provider}/authorize-url
 * Public (no auth) - the user isn't logged in yet. Returns the real
 * Google/Facebook authorize URL, built server-side since the client can't
 * safely hold the OAuth client_id/secret itself.
 */
export async function getAuthorizeUrl(provider, appRedirectUrl) {
  const json = await request(
    `/auth/social/${provider}/authorize-url?app_redirect=${encodeURIComponent(appRedirectUrl)}`
  );
  return json.data.authorizationUrl;
}
