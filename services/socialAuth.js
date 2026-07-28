import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { getAuthorizeUrl } from './socialAuthApi';

// Same web-popup-blocking problem and fix as services/paystackCheckout.js:
// a popup opened after an await is untrusted as "user-initiated" and gets
// silently blocked, so on web we open a blank tab immediately and redirect
// it once the authorize URL is ready, then poll its location for our
// callback prefix (reading it throws while the tab is on the provider's
// origin - that's expected, just keep polling).
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
 * Runs a full Google/Facebook sign-in via the backend's OAuth bridge
 * (App\Http\Controllers\Api\SocialAuthController) and resolves with a
 * Sanctum token on success. Throws an Error with a user-facing message on
 * cancellation or failure.
 */
export async function loginWithSocialProvider(provider) {
  let popup = null;
  if (Platform.OS === 'web') {
    popup = window.open('about:blank', '_blank');
    if (!popup) {
      throw new Error('Please allow pop-ups for this site to sign in.');
    }
  }

  try {
    const appRedirectUrl = Linking.createURL('social-callback');
    const authorizationUrl = await getAuthorizeUrl(provider, appRedirectUrl);

    let result;
    if (Platform.OS === 'web') {
      popup.location.href = authorizationUrl;
      result = await waitForWebPopupRedirect(popup, appRedirectUrl);
    } else {
      result = await WebBrowser.openAuthSessionAsync(authorizationUrl, appRedirectUrl);
    }

    if (result.type !== 'success') {
      throw new Error('Sign-in was cancelled.');
    }

    const { queryParams } = Linking.parse(result.url);
    if (queryParams?.error) {
      throw new Error(queryParams.error);
    }
    if (!queryParams?.token) {
      throw new Error('Sign-in did not complete. Please try again.');
    }

    return queryParams.token;
  } finally {
    if (popup && !popup.closed) popup.close();
  }
}
