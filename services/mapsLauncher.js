import { Linking } from 'react-native';

// Both are universal web URLs (not native-only schemes), so they work via
// Linking.openURL on every platform this app runs on - each one still
// deep-links into its native app when installed (iOS Google Maps / Apple
// Maps app, Android Google Maps), and falls back to opening in a browser
// otherwise. This mirrors Settings > App Preferences > Map Provider, the
// one place in the app that lets a user express which they prefer.
function buildDirectionsUrl(address, provider) {
  const query = encodeURIComponent(address);
  if (provider === 'Apple Maps') {
    return `https://maps.apple.com/?daddr=${query}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function openDirections(address, provider) {
  if (!address) return Promise.resolve();
  return Linking.openURL(buildDirectionsUrl(address, provider));
}
