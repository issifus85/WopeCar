import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useFonts } from 'expo-font';
import { ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import {
  SourceSans3_300Light,
  SourceSans3_400Regular,
  SourceSans3_500Medium,
  SourceSans3_600SemiBold,
  SourceSans3_700Bold,
} from '@expo-google-fonts/source-sans-3';
import { DancingScript_700Bold } from '@expo-google-fonts/dancing-script';
import * as SplashScreen from 'expo-splash-screen';
import { FONTS } from '../constants/theme';
import { AuthProvider } from '../contexts/AuthContext';
import { FavoritesProvider } from '../contexts/FavoritesContext';
import { CartProvider } from '../contexts/CartContext';
import { CheckoutProvider } from '../contexts/CheckoutContext';
import { AddCarProvider } from '../contexts/AddCarContext';
import { InspectionProvider } from '../contexts/InspectionContext';
import { BookingsProvider } from '../contexts/BookingsContext';
import { SettingsProvider } from '../contexts/SettingsContext';
import { CurrencyProvider } from '../contexts/CurrencyContext';
import { InboxProvider } from '../contexts/InboxContext';
import { VendorProvider } from '../contexts/VendorContext';
import { useSettings } from '../contexts/SettingsContext';
import { ThemeProvider, useAppTheme, toNavigationTheme } from '../contexts/ThemeContext';
import BiometricGate from '../components/BiometricGate';
import SplashVideoScreen from '../components/SplashVideoScreen';
import supabase from '../services/supabase';
import { parseTokensFromUrl, parseAuthErrorFromUrl } from '../services/supabaseAuthApi';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SourceSans3_300Light,
    SourceSans3_400Regular,
    SourceSans3_500Medium,
    SourceSans3_600SemiBold,
    SourceSans3_700Bold,
    DancingScript_700Bold,
    DanburyCaps: require('../assets/fonts/DanburyCaps.otf'),
    DanburySmall: require('../assets/fonts/DanburySmall.otf'),
  });
  // Skips the splash video when landing here from a Supabase auth redirect
  // (email confirmation / password reset link) - otherwise the session
  // token sits in the URL behind an unskippable-looking video for however
  // long it takes the user to notice "Tap to skip", which reads as a
  // broken/blank page. Web only: native deep links never carry the session
  // in a URL fragment the way web's detectSessionInUrl does.
  const [showIntro, setShowIntro] = useState(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return true;
    // 'error=' covers a link Supabase considers already used/expired (see
    // parseAuthErrorFromUrl) - that's still a real auth redirect landing
    // that deserves app/email-confirmed.js's explanation, not the video.
    const hash = window.location.hash;
    return !hash.includes('access_token') && !hash.includes('error=');
  });

  // Captured once, synchronously, from the raw URL hash - before Supabase
  // JS's async detectSessionInUrl has a chance to strip it via
  // history.replaceState(). Distinguishes an email-confirmation redirect
  // ('type=signup') from a password-recovery one ('type=recovery') so
  // RootNavigator's SIGNED_IN handler below knows which landing screen to
  // send the user to - re-reading window.location.hash later, inside that
  // handler, would race Supabase's own cleanup and could read an
  // already-cleared hash.
  const [authRedirectType] = useState(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
    const hash = window.location.hash;
    if (hash.includes('type=signup')) return 'signup';
    if (hash.includes('type=recovery')) return 'recovery';
    return null;
  });

  // Belt-and-suspenders for the check above: a hash-only URL change (e.g.
  // pasting the confirmation link into an address bar that already has this
  // app open in it) doesn't trigger a full page load, so the lazy useState
  // initializer above never re-runs - only a 'hashchange' event fires. Without
  // this, the exact same "blank-looking" splash bug resurfaces any time the
  // link lands on an already-open tab instead of a fresh one.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onHashChange = () => {
      if (window.location.hash.includes('access_token') || window.location.hash.includes('error=')) {
        setShowIntro(false);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Hides the native static splash (the expo-splash-screen image config in
  // app.json) as soon as fonts are ready, regardless of whether the video
  // intro or the tab navigator renders next - both paint the same white
  // background the splash uses, so there's no flash either way.
  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  if (showIntro) {
    return <SplashVideoScreen onFinish={() => setShowIntro(false)} />;
  }

  return (
    <AuthProvider>
      <FavoritesProvider>
        <CartProvider>
        <CheckoutProvider>
        <InspectionProvider>
        <BookingsProvider>
        <SettingsProvider>
        <CurrencyProvider>
        <InboxProvider>
        <VendorProvider>
        <AddCarProvider>
        <ThemeProvider>
          <RootNavigator authRedirectType={authRedirectType} />
        </ThemeProvider>
        </AddCarProvider>
        </VendorProvider>
        </InboxProvider>
        </CurrencyProvider>
        </SettingsProvider>
        </BookingsProvider>
        </InspectionProvider>
        </CheckoutProvider>
        </CartProvider>
      </FavoritesProvider>
    </AuthProvider>
  );
}

function RootNavigator({ authRedirectType }) {
  const { colors, isDark } = useAppTheme();
  const navTheme = useMemo(() => toNavigationTheme(colors, isDark), [colors, isDark]);
  const router = useRouter();
  const { settings, isLoading: settingsLoading } = useSettings();
  const hasAutoRedirected = useRef(false);

  // Airbnb-style guest/host memory: reopening the app lands you back in
  // whichever experience you last switched to, not always the renter side.
  // Fires once, right after settings finish loading - later mode switches
  // navigate explicitly on their own, this is only for a fresh app launch.
  useEffect(() => {
    if (settingsLoading || hasAutoRedirected.current) return;
    hasAutoRedirected.current = true;
    if (settings.appMode === 'vendor') {
      router.replace('/vendor');
    }
  }, [settingsLoading, settings.appMode, router]);

  // Password-reset AND email-confirmation link landing, for both platforms
  // a Supabase auth email might be opened on. Mirrors
  // services/supabaseAuthApi.js's OAuth deep-link handling (performOAuthFlow)
  // and closes the gap flagged for email-confirmation links (see
  // supabase-auth-migration memory) - both are actually built, since ~4,700
  // migrated users depend on password reset working, and every new signup
  // depends on confirmation not dead-ending on a blank browser tab.
  //
  // Web: Supabase JS's detectSessionInUrl already parses the URL's
  // #access_token fragment and establishes the session automatically; it
  // fires 'PASSWORD_RECOVERY' (not 'SIGNED_IN') on auth state change when
  // the token's type is recovery, so that's all that needs handling here.
  // A signup confirmation instead fires plain 'SIGNED_IN' - same event a
  // normal login produces - so authRedirectType (captured synchronously in
  // RootLayout, before this async listener can even attach) is what tells
  // the two apart without ever hijacking a real login.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/reset-password');
      } else if (event === 'SIGNED_IN' && authRedirectType === 'signup') {
        router.replace('/email-confirmed');
      }
    });
    return () => subscription.unsubscribe();
    // Deliberately run once on mount, not on every `router`/authRedirectType
    // identity change - useRouter() doesn't guarantee a stable reference
    // across renders, and resubscribing onAuthStateChange on every render
    // caused a real infinite loop: each new subscription replays the current
    // session as a fresh event, AuthContext's own separate listener treats
    // that as a genuine SIGNED_IN and calls refresh(), which re-renders this
    // component, which resubscribes again. router.replace() itself stays
    // callable from a stale closure regardless (it proxies to a stable
    // navigation ref), and authRedirectType never changes after mount (it's
    // a useState with no setter called past its initializer).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Native: both the recovery link and the confirmation link open in the
  // system browser, which redirects to reset-password-callback
  // (Linking.createURL() in requestPasswordReset) or email-confirmed
  // (Linking.createURL() in register()) respectively - the OS then hands
  // that off to this app. No automatic session detection like web's
  // detectSessionInUrl, so the tokens are parsed and set manually, same as
  // performOAuthFlow does for OAuth.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const handleUrl = async (url) => {
      const isRecovery = url?.includes('reset-password-callback');
      const isEmailConfirmed = url?.includes('email-confirmed');
      if (!isRecovery && !isEmailConfirmed) return;

      const { access_token, refresh_token } = parseTokensFromUrl(url);
      if (!access_token || !refresh_token) {
        // No token means Supabase considered this link already used/expired
        // (see parseAuthErrorFromUrl's own comment) rather than a real
        // failure to act on - only email-confirmed has a landing screen
        // built to explain that; reset-password-callback silently doing
        // nothing here matches its pre-existing behavior, unchanged.
        if (isEmailConfirmed) {
          const linkError = parseAuthErrorFromUrl(url) || 'This confirmation link is no longer valid.';
          router.replace({ pathname: '/email-confirmed', params: { linkError } });
        }
        return;
      }

      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (!error) router.replace(isRecovery ? '/reset-password' : '/email-confirmed');
    };

    Linking.getInitialURL().then((url) => { if (url) handleUrl(url); });
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => subscription.remove();
    // Same "run once on mount" reasoning as the web effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const themedHeader = {
    headerTintColor: colors.textPrimary,
    headerStyle: { backgroundColor: colors.surface },
    headerTitleStyle: { fontFamily: FONTS.semiBold },
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <NavigationThemeProvider value={navTheme}>
        <BiometricGate>
        <Stack screenOptions={{ headerShown: false }}>
          {/* title here is only used as the back-button fallback label for
              screens pushed straight from a tab (e.g. Inbox, Settings) that
              don't set their own headerBackTitle - without it, React
              Navigation falls back to the literal route name "(tabs)". */}
          <Stack.Screen name="(tabs)" options={{ title: 'Account' }} />
          {/* title is unused by this screen (headerShown: false, custom
              header) - it only supplies the back-button fallback label for
              whatever gets pushed on top (e.g. Inbox, reached via
              "Message Host"). */}
          <Stack.Screen name="car/[id]" options={{ headerShown: false, title: 'Car Details' }} />
          {/* Same reasoning as car/[id] above: these six screens all render
              their own back chevron via CheckoutHeader, so headerShown stays
              false - title only exists as the back-button fallback label for
              a screen pushed on top without its own headerBackTitle (e.g.
              Terms of Service, reached via the checkbox link on Payment). */}
          <Stack.Screen name="checkout/dates" options={{ headerShown: false, title: 'Select Dates' }} />
          <Stack.Screen name="checkout/details" options={{ headerShown: false, title: 'Pickup & Return' }} />
          <Stack.Screen name="checkout/addons" options={{ headerShown: false, title: 'Travel Add-ons' }} />
          <Stack.Screen name="checkout/summary" options={{ headerShown: false, title: 'Cost Breakdown' }} />
          <Stack.Screen name="checkout/form" options={{ headerShown: false, title: 'Booking Details' }} />
          <Stack.Screen name="checkout/payment" options={{ headerShown: false, title: 'Payment' }} />
          {/* Same reasoning as checkout/* above - these render their own
              back chevron via InspectionHeader. */}
          <Stack.Screen name="inspection/mileage" options={{ headerShown: false, title: 'Vehicle Inspection' }} />
          <Stack.Screen name="inspection/exterior" options={{ headerShown: false, title: 'Exterior Damage' }} />
          <Stack.Screen name="inspection/interior" options={{ headerShown: false, title: 'Vehicle Checklist' }} />
          <Stack.Screen name="inspection/photos" options={{ headerShown: false, title: 'Vehicle Photos' }} />
          <Stack.Screen name="inspection/signatures" options={{ headerShown: false, title: 'Signatures' }} />
          <Stack.Screen name="inspection/report" options={{ headerShown: false, title: 'Inspection Report' }} />
          <Stack.Screen name="rental-agreement/[bookingId]" options={{ headerShown: false, title: 'Rental Agreement' }} />
          <Stack.Screen name="rental-agreement/report" options={{ headerShown: false, title: 'Rental Agreement Report' }} />
          <Stack.Screen name="review/[bookingId]" options={{ headerShown: true, title: 'Rate Your Trip', headerBackTitle: 'Back', ...themedHeader }} />
          {/* Admin Panel - own nested Stack + gate check in admin/_layout.js,
              own native headers throughout (AdminHeader), so headerShown
              stays false here same as the vendor group below. */}
          <Stack.Screen name="admin" options={{ headerShown: false, title: 'Admin Panel' }} />
          {/* Vendor/Host mode - its own bottom tab bar (Dashboard/Bookings/
              Calendar/Support/Menu) plus stack-pushed screens on top, same
              shape as the renter (tabs) group + car/[id] etc below. Every
              vendor screen renders its own in-screen header (matching
              checkout/*'s pattern), so headerShown stays false throughout. */}
          <Stack.Screen name="vendor/apply" options={{ headerShown: false, title: 'Become a Vendor' }} />
          <Stack.Screen name="vendor/(tabs)" options={{ headerShown: false, title: 'Vendor Dashboard' }} />
          <Stack.Screen name="vendor/fleet" options={{ headerShown: false, title: 'My Fleet' }} />
          {/* Add Car wizard - own step-indicator header (VendorWizardHeader),
              mirrors the checkout/* screens' headerShown:false pattern. */}
          <Stack.Screen name="vendor/add-car/index" options={{ headerShown: false, title: 'Vehicle Details' }} />
          <Stack.Screen name="vendor/add-car/location" options={{ headerShown: false, title: 'Location & Pricing' }} />
          <Stack.Screen name="vendor/add-car/regional" options={{ headerShown: false, title: 'Regional Add-on Pricing' }} />
          <Stack.Screen name="vendor/add-car/vetting" options={{ headerShown: false, title: 'Schedule Photos & Vetting' }} />
          <Stack.Screen name="vendor/add-car/review" options={{ headerShown: false, title: 'Review & Submit' }} />
          <Stack.Screen name="vendor/car/[id]" options={{ headerShown: false, title: 'Car Management' }} />
          <Stack.Screen name="vendor/car/edit/[id]" options={{ headerShown: false, title: 'Edit Listing' }} />
          <Stack.Screen name="vendor/car/availability/[id]" options={{ headerShown: false, title: 'Manage Availability' }} />
          <Stack.Screen name="vendor/car/pricing/[id]" options={{ headerShown: false, title: 'Pricing & Discounts' }} />
          <Stack.Screen name="vendor/history" options={{ headerShown: false, title: 'Booking History' }} />
          <Stack.Screen name="vendor/resources" options={{ headerShown: false, title: 'Vendor Resources' }} />
          <Stack.Screen name="vendor/getting-started" options={{ headerShown: false, title: 'Getting Started as a Host' }} />
          <Stack.Screen name="vendor/pricing-guide" options={{ headerShown: false, title: 'Pricing Your Vehicle' }} />
          <Stack.Screen name="vendor/bookings-guide" options={{ headerShown: false, title: 'Managing Bookings & Availability' }} />
          <Stack.Screen name="vendor/payouts-guide" options={{ headerShown: false, title: 'Getting Paid' }} />
          <Stack.Screen name="vendor/safety-guide" options={{ headerShown: false, title: 'Vehicle Requirements & Safety' }} />
          <Stack.Screen name="vendor/agreement" options={{ headerShown: false, title: 'Vendor Agreement' }} />
          <Stack.Screen name="vendor/settings" options={{ headerShown: false, title: 'Vendor Settings' }} />
          <Stack.Screen name="vendor/payout-method" options={{ headerShown: false, title: 'Payout Method' }} />
          <Stack.Screen name="vendor/business-info" options={{ headerShown: false, title: 'Business & Tax Information' }} />
          <Stack.Screen name="vendor/document-verification" options={{ headerShown: false, title: 'Document Verification' }} />
          <Stack.Screen name="vendor/inspections" options={{ headerShown: false, title: 'Vehicle Inspections' }} />
          <Stack.Screen name="vendor/inspection/mileage" options={{ headerShown: false, title: 'Vehicle Inspection' }} />
          <Stack.Screen name="vendor/inspection/exterior" options={{ headerShown: false, title: 'Exterior Damage' }} />
          <Stack.Screen name="vendor/inspection/interior" options={{ headerShown: false, title: 'Vehicle Checklist' }} />
          <Stack.Screen name="vendor/inspection/photos" options={{ headerShown: false, title: 'Vehicle Photos' }} />
          <Stack.Screen name="vendor/inspection/signatures" options={{ headerShown: false, title: 'Signatures' }} />
          <Stack.Screen
            name="booking/[id]"
            options={{
              headerShown: true,
              title: 'Booking Details',
              headerBackTitle: 'Bookings',
              ...themedHeader,
            }}
          />
          <Stack.Screen
            name="login"
            options={{
              headerShown: true,
              title: '',
              headerTransparent: true,
              // Sits over a hero photo, not the app surface - stays white
              // regardless of theme so it's always readable on the image.
              headerTintColor: colors.white,
            }}
          />
          <Stack.Screen
            name="forgot-password"
            options={{ headerShown: true, title: 'Reset Password', ...themedHeader }}
          />
          <Stack.Screen
            name="reset-password"
            options={{ headerShown: true, title: 'Reset Password', headerBackVisible: false, ...themedHeader }}
          />
          <Stack.Screen
            name="email-confirmed"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="confirm-email"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="account"
            options={{ headerShown: true, title: 'Account', ...themedHeader }}
          />
          <Stack.Screen
            name="inbox/index"
            options={{ headerShown: true, title: 'Inbox', ...themedHeader }}
          />
          {/* No headerBackTitle: this screen is reached from three different
              places (Inbox hub, Car Details, Booking Details), so it falls
              back to whichever screen actually pushed it - see the "title"
              comment on car/[id] above. */}
          <Stack.Screen
            name="inbox/[id]"
            options={{ headerShown: true, title: 'Conversation', ...themedHeader }}
          />
          <Stack.Screen
            name="staff-inbox/index"
            options={{ headerShown: true, title: 'Express Desk', headerBackTitle: 'Account', ...themedHeader }}
          />
          <Stack.Screen
            name="staff-inbox/[id]"
            options={{ headerShown: true, title: 'Conversation', headerBackTitle: 'Express Desk', ...themedHeader }}
          />
          <Stack.Screen
            name="documents"
            options={{ headerShown: true, title: 'Documents', ...themedHeader }}
          />
          <Stack.Screen
            name="protection-plan"
            options={{ headerShown: true, title: 'Protection Plan', ...themedHeader }}
          />
          <Stack.Screen
            name="terms"
            options={{ headerShown: true, title: 'Terms of Service', ...themedHeader }}
          />
          <Stack.Screen
            name="rental-terms"
            options={{ headerShown: true, title: 'Rental Terms', ...themedHeader }}
          />
          <Stack.Screen
            name="privacy"
            options={{ headerShown: true, title: 'Privacy Policy', ...themedHeader }}
          />
          <Stack.Screen
            name="support"
            options={{ headerShown: true, title: 'Support', ...themedHeader }}
          />
          <Stack.Screen
            name="settings/index"
            options={{ headerShown: true, title: 'Settings', ...themedHeader }}
          />
          <Stack.Screen
            name="settings/change-password"
            options={{ headerShown: true, title: 'Change Password', headerBackTitle: 'Settings', ...themedHeader }}
          />
          <Stack.Screen
            name="settings/devices"
            options={{ headerShown: true, title: 'Active Devices', headerBackTitle: 'Settings', ...themedHeader }}
          />
          <Stack.Screen
            name="settings/login-activity"
            options={{ headerShown: true, title: 'Login Activity', headerBackTitle: 'Settings', ...themedHeader }}
          />
          <Stack.Screen
            name="settings/trusted-devices"
            options={{ headerShown: true, title: 'Trusted Devices', headerBackTitle: 'Settings', ...themedHeader }}
          />
          <Stack.Screen
            name="settings/delete-account"
            options={{ headerShown: true, title: 'Delete Account', headerBackTitle: 'Settings', ...themedHeader }}
          />
          <Stack.Screen
            name="settings/export-data"
            options={{ headerShown: true, title: 'Download My Data', headerBackTitle: 'Settings', ...themedHeader }}
          />
          <Stack.Screen
            name="settings/billing-address"
            options={{ headerShown: true, title: 'Billing Address', headerBackTitle: 'Settings', ...themedHeader }}
          />
          <Stack.Screen
            name="settings/payment-history"
            options={{ headerShown: true, title: 'Payment History', headerBackTitle: 'Settings', ...themedHeader }}
          />
          <Stack.Screen
            name="settings/about"
            options={{ headerShown: true, title: 'About WopeCar', headerBackTitle: 'Settings', ...themedHeader }}
          />
          <Stack.Screen
            name="settings/data-sharing"
            options={{ headerShown: true, title: 'Data Sharing Preferences', headerBackTitle: 'Settings', ...themedHeader }}
          />
          <Stack.Screen
            name="settings/payment-methods"
            options={{ headerShown: true, title: 'Payment Methods', headerBackTitle: 'Settings', ...themedHeader }}
          />
          <Stack.Screen
            name="settings/refund-history"
            options={{ headerShown: true, title: 'Refund History', headerBackTitle: 'Settings', ...themedHeader }}
          />
          <Stack.Screen
            name="settings/diagnostics"
            options={{ headerShown: true, title: 'Diagnostics', headerBackTitle: 'Settings', ...themedHeader }}
          />
          <Stack.Screen
            name="settings/developer-mode"
            options={{ headerShown: true, title: 'Developer Mode', headerBackTitle: 'Settings', ...themedHeader }}
          />
          <Stack.Screen
            name="settings/help-centre"
            options={{ headerShown: true, title: 'Help Centre', headerBackTitle: 'Support', ...themedHeader }}
          />
          <Stack.Screen
            name="settings/safety-centre"
            options={{ headerShown: true, title: 'Safety Centre', headerBackTitle: 'Support', ...themedHeader }}
          />
        </Stack>
        </BiometricGate>
      </NavigationThemeProvider>
    </View>
  );
}
