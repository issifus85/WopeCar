import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
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
  const [showIntro, setShowIntro] = useState(true);

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
          <RootNavigator />
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

function RootNavigator() {
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
          <Stack.Screen name="rental-agreement/[bookingId]" options={{ headerShown: false, title: 'Rental Agreement' }} />
          {/* Vendor/Host mode - its own bottom tab bar (Dashboard/Bookings/
              Calendar/Support/Menu) plus stack-pushed screens on top, same
              shape as the renter (tabs) group + car/[id] etc below. Every
              vendor screen renders its own in-screen header (matching
              checkout/*'s pattern), so headerShown stays false throughout. */}
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
          <Stack.Screen name="vendor/history" options={{ headerShown: false, title: 'Booking History' }} />
          <Stack.Screen name="vendor/resources" options={{ headerShown: false, title: 'Vendor Resources' }} />
          <Stack.Screen name="vendor/getting-started" options={{ headerShown: false, title: 'Getting Started as a Host' }} />
          <Stack.Screen name="vendor/pricing-guide" options={{ headerShown: false, title: 'Pricing Your Vehicle' }} />
          <Stack.Screen name="vendor/bookings-guide" options={{ headerShown: false, title: 'Managing Bookings & Availability' }} />
          <Stack.Screen name="vendor/payouts-guide" options={{ headerShown: false, title: 'Getting Paid' }} />
          <Stack.Screen name="vendor/safety-guide" options={{ headerShown: false, title: 'Vehicle Requirements & Safety' }} />
          <Stack.Screen name="vendor/agreement" options={{ headerShown: false, title: 'Vendor Agreement' }} />
          <Stack.Screen name="vendor/settings" options={{ headerShown: false, title: 'Vendor Settings' }} />
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
            name="terms"
            options={{ headerShown: true, title: 'Terms of Service', ...themedHeader }}
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
