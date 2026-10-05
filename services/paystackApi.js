import supabase from './supabase';

// Paystack's hosted checkout needs a real http(s) callback_url (it doesn't
// reliably honor the app's custom-scheme deep link - exp:// in Expo Go,
// wopecar:// in a standalone build - falling back to a default configured in
// the Paystack dashboard instead), so this wraps the real app redirect URL in
// a bridge page that Paystack can redirect to, which then forwards the
// browser on to the actual app deep link.
//
// The bridge is the new website's /payment/callback route
// (wopecar-website app/payment/callback/route.ts, allow-lists app_redirect).
// It used to be the legacy Laravel route on wopecarpreprod.com, which this
// app's production builds also pointed at by mistake. The Vercel alias is
// used (not wopecar.com) so it works both before and after wopecar.com's DNS
// cut-over; on native the in-app WebView intercepts this URL before it even
// loads (components/PaystackWebViewModal.js), so it's mainly a unique,
// well-formed https prefix there. Older installed builds keep using
// wopecarpreprod.com until they update.
const SITE_URL = 'https://wopecar-website.vercel.app';

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
export async function initializePayment({ amount, callbackUrl, bookingIds }) {
  const { data, error } = await supabase.functions.invoke('paystack-initialize', {
    body: { amount, callbackUrl, bookingIds },
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
