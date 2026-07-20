import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { initializePayment, verifyPayment, buildPaystackCallbackUrl } from './paystackApi';

// On web, window.open() is only trusted as "user-initiated" when called
// synchronously inside the click handler - calling it after the
// initializePayment() await gets silently popup-blocked. So on web we open
// a blank tab immediately and redirect it once the checkout URL is ready,
// then poll its location for our callback URL (reading it throws while the
// tab is on Paystack's origin - that's expected, just keep polling).
function waitForWebPopupRedirect(popup, callbackUrl) {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (popup.closed) {
        clearInterval(interval);
        resolve({ type: 'cancel' });
        return;
      }
      let currentUrl;
      try {
        currentUrl = popup.location.href;
      } catch {
        return;
      }
      if (currentUrl && currentUrl.startsWith(callbackUrl)) {
        clearInterval(interval);
        popup.close();
        resolve({ type: 'success', url: currentUrl });
      }
    }, 500);
  });
}

/**
 * Runs a full Paystack hosted-checkout charge for `amount` (in GHS) and
 * resolves with the verified transaction reference once payment succeeds.
 * Throws an Error with a user-facing message on cancellation or failure.
 */
export async function payWithPaystack(amount) {
  let popup = null;
  if (Platform.OS === 'web') {
    popup = window.open('about:blank', '_blank');
    if (!popup) {
      throw new Error('Please allow pop-ups for this site to complete payment.');
    }
  }

  try {
    const appRedirectUrl = Linking.createURL('payment-callback');
    const { authorization_url: authUrl, reference } = await initializePayment({
      amount,
      callbackUrl: buildPaystackCallbackUrl(appRedirectUrl),
    });

    let result;
    if (Platform.OS === 'web') {
      popup.location.href = authUrl;
      result = await waitForWebPopupRedirect(popup, appRedirectUrl);
    } else {
      result = await WebBrowser.openAuthSessionAsync(authUrl, appRedirectUrl);
    }

    if (result.type !== 'success') {
      throw new Error('Payment was cancelled.');
    }

    const verification = await verifyPayment(reference);
    if (verification.transaction_status !== 'success') {
      throw new Error('Payment was not successful. Please try again.');
    }

    return reference;
  } catch (e) {
    if (popup && !popup.closed) popup.close();
    throw e;
  }
}
