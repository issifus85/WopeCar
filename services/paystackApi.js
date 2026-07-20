import { request } from './api';

// Same host as API_BASE_URL but without the /api prefix - this hits the
// plain web route (routes/web.php), not the JSON API.
const SITE_URL = 'https://wopecarpreprod.com';

/**
 * Paystack's hosted checkout needs a real http(s) callback_url - it doesn't
 * reliably honor the app's custom-scheme deep link (exp:// in Expo Go,
 * wopecar:// in a standalone build), silently falling back to a default
 * configured in the Paystack dashboard instead. This wraps the real app
 * redirect URL in a backend bridge page that Paystack can redirect to,
 * which then forwards the browser on to the actual app deep link.
 */
export function buildPaystackCallbackUrl(appRedirectUrl) {
  return `${SITE_URL}/payment/callback?app_redirect=${encodeURIComponent(appRedirectUrl)}`;
}

/**
 * POST /api/payments/paystack/initialize
 * Starts a Paystack transaction server-side and returns the hosted
 * checkout URL to open plus the reference to verify afterwards.
 */
export async function initializePayment({ amount, callbackUrl }) {
  const json = await request('/payments/paystack/initialize', {
    method: 'POST',
    auth: true,
    body: { amount, callback_url: callbackUrl },
  });
  return json.data;
}

/**
 * GET /api/payments/paystack/verify/:reference
 * Confirms the transaction's real status server-to-server.
 */
export async function verifyPayment(reference) {
  const json = await request(`/payments/paystack/verify/${reference}`, {
    auth: true,
  });
  return json.data;
}
