import { Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import supabase from './supabase';

// data.url is normally an internal route (e.g. '/booking/123'), handled via
// router.push below - but the new app-update notification needs to send
// someone straight to the App Store/Play Store, a real https URL. Every
// internal route in this app starts with '/', so this is an unambiguous way
// to pick the right navigation for both cases from the same data.url field
// without adding a second payload key everywhere a notification is built.
function openNotificationUrl(url) {
  if (/^https?:\/\//i.test(url)) {
    Linking.openURL(url).catch(() => {});
  } else {
    router.push(url);
  }
}

// Local, on-device notifications only - no push token, no EAS project, no
// backend. Native uses expo-notifications; web (the only platform this
// project's browser preview can actually verify) uses the browser's own
// Notification API directly, since expo-notifications does not support web.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

// Android only shows a heads-up banner for a channel at HIGH importance, and
// a channel's importance can't be raised once created - so the old 'default'
// channel (importance DEFAULT, shade-only) stays as is and pushes use this
// new one. send-push-notification passes channelId: ALERT_CHANNEL_ID.
export const ALERT_CHANNEL_ID = 'alerts';

export async function requestPushPermission() {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (window.Notification.permission === 'granted') return true;
    const result = await window.Notification.requestPermission();
    return result === 'granted';
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
      name: 'WopeCar alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3EB6BA',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

// Sets the number on the app icon. iOS needs the badge permission (granted
// together with alerts above); a no-op on web, and on Android launchers that
// don't support numeric badges.
export async function setAppBadgeCount(count) {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, Number(count) || 0));
  } catch {
    // Badge is cosmetic - never let it surface an error.
  }
}

// data.url (if provided) is where tapping the notification should deep-link
// to - wired directly here for web (there's no separate "delivered" event to
// hook later, the click handler has to be attached at creation time) and via
// registerNotificationResponseHandler() below for native.
export async function sendLocalPushNotification({ title, body, data = {} }) {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (window.Notification.permission !== 'granted') return;
    const notification = new window.Notification(title, { body });
    if (data.url) {
      notification.onclick = () => {
        window.focus();
        openNotificationUrl(data.url);
      };
    }
    return;
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  await Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: null,
  });
}

// Web has no Expo push token concept - the browser Notification API used
// above is the whole story there, no server-side registration needed.
// Native: gets this device's real Expo push token and upserts it into
// push_tokens (RLS: push_tokens_owner_insert/_update, both scoped to
// auth.uid() = user_id), keyed by the token itself so a device that's had
// multiple different accounts signed in on it just gets reassigned to
// whoever's logged in now rather than accumulating stale rows. Best-effort
// throughout - a simulator (no real APNs/FCM credentials), a denied
// permission, or a token-fetch failure should never block sign-in.
// Every step writes one row to push_registration_log (migration 0129) -
// production's push_tokens table is empty even though dozens of people signed
// in, and this used to swallow every failure with no trace of which step.
async function logPushStep(userId, step, ok, message) {
  try {
    await supabase.from('push_registration_log').insert({
      user_id: userId,
      platform: Platform.OS,
      step,
      ok,
      message: message ? String(message).slice(0, 500) : null,
      app_version: Constants.expoConfig?.version ?? null,
    });
  } catch {
    // Logging must never be the thing that breaks registration.
  }
}

export async function registerPushToken() {
  if (Platform.OS === 'web') return;

  let userId = null;
  try {
    const { data: authData } = await supabase.auth.getUser();
    userId = authData?.user?.id ?? null;
    if (!userId) return;

    const granted = await requestPushPermission();
    if (!granted) {
      await logPushStep(userId, 'permission', false, 'Notification permission not granted');
      return;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      await logPushStep(userId, 'project_id', false, 'No EAS projectId in the app config');
      return;
    }

    const { data: tokenData } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!tokenData?.data) {
      await logPushStep(userId, 'token', false, 'getExpoPushTokenAsync returned no token');
      return;
    }

    const { error } = await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, token: tokenData.data, platform: Platform.OS, updated_at: new Date().toISOString() }, { onConflict: 'token' });
    if (error) {
      await logPushStep(userId, 'save', false, error.message);
      return;
    }
    await logPushStep(userId, 'registered', true, null);
  } catch (e) {
    // Simulators/emulators without real push credentials throw here - the
    // app stays usable without a token; the reason is logged for staff.
    if (userId) await logPushStep(userId, 'exception', false, e?.message ?? e);
  }
}

export function registerNotificationResponseHandler() {
  if (Platform.OS === 'web') return undefined;

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const url = response.notification.request.content.data?.url;
    if (url) openNotificationUrl(url);
  });

  return () => subscription.remove();
}
