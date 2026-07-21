import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';

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
      shouldSetBadge: false,
    }),
  });
}

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
  }

  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
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
        router.push(data.url);
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

export function registerNotificationResponseHandler() {
  if (Platform.OS === 'web') return undefined;

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const url = response.notification.request.content.data?.url;
    if (url) router.push(url);
  });

  return () => subscription.remove();
}
