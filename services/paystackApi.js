import supabase from './supabase';

// Same host the Laravel backend still runs on - this callback bridge is a
// plain unauthenticated web route (routes/web.php), not the JSON API, so
// it's unaffected by the dead-Laravel-auth-token issue that took out the
// two functions below. Left as-is: Paystack's hosted checkout needs a real
// http(s) callback_url (it doesn't reliably honor the app's custom-scheme
// deep link - exp:// in Expo Go, wopecar:// in a standalone build - falling
// back to a default configured in the Paystack dashboard instead), so this
// wraps the real app redirect URL in a bridge page that Paystack can
// redirect to, which then forwards the browser on to the actual app deep
// link. Confirmed still live via curl before keeping this unchanged.
const SITE_URL = 'https://wopecarpreprod.com';

export function buildPaystackCallbackUrl(appRedirectUrl) {
  return `${SITE_URL}/payment/callback?app_redirect=${encodeURIComponent(appRedirectUrl)}`;
}

/**
 * Starts a Paystack transaction server-side (paystack-initialize Edge
 * Function) and returns the hosted checkout URL to open plus the reference
 * to verify afterwards. Replaces the old Laravel /payments/paystack/
 * initialize endpoint, which required a Laravel Sanctum bearer token that
 * nothing has written since auth moved to Supabase - every real booking's
 * payment step was silently 401ing before this.
 */
export async function initializePayment({ amount, callbackUrl }) {
  const { data, error } = await supabase.functions.invoke('paystack-initialize', {
    body: { amount, callbackUrl },
  });
  if (error) throw error;
  return data;
}

/**
 * Confirms the transaction's real status server-to-server
 * (paystack-verify Edge Function). Same replacement reasoning as
 * initializePayment above.
 */
export async function verifyPayment(reference) {
  const { data, error } = await supabase.functions.invoke('paystack-verify', {
    body: { reference },
  });
  if (error) throw error;
  return data;
}
