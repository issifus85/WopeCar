import { StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS } from '../constants/theme';

const BANNER_HEIGHT = 28;

// Keyed by app.config.js's extra.APP_ENV (set per eas.json build profile).
// Anything not listed here - including 'production' and a missing/unset
// value - renders nothing. Defaulting the unset case to hidden rather than
// to 'development' is deliberate: an already-installed production build
// that receives this code before its config actually carries a real
// APP_ENV must still never show a banner.
const ENV_LABELS = {
  development: 'DEVELOPMENT',
  preview: 'STAGING',
};

// TEMPORARY - flip back to false once App Store/Play Store screenshots are
// captured. Hides the banner regardless of APP_ENV so store screenshots
// (taken from a preview/test build, since there's no production build yet)
// don't show "Test build. Not live." across the top of every shot.
const HIDE_FOR_STORE_SCREENSHOTS = true;

// Orange (not COLORS.teal) and read directly off COLORS rather than
// useAppTheme() - deliberately theme-invariant, same exception pattern as
// login.js's teal overlay, so it stays equally jarring in dark mode.
export default function EnvironmentBanner() {
  const insets = useSafeAreaInsets();
  const appEnv = Constants.expoConfig?.extra?.APP_ENV;
  const label = ENV_LABELS[appEnv];

  if (!label || HIDE_FOR_STORE_SCREENSHOTS) return null;

  return (
    <View style={[styles.container, { height: insets.top + BANNER_HEIGHT }]}>
      <Text style={styles.text}>🧪  {label} — Test build. Not live.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: COLORS.orange,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
  },
  text: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.white,
    textAlign: 'center',
  },
});
