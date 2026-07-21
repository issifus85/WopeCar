import { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
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
import * as SplashScreen from 'expo-splash-screen';
import { FONTS } from '../constants/theme';
import { AuthProvider } from '../contexts/AuthContext';
import { FavoritesProvider } from '../contexts/FavoritesContext';
import { CartProvider } from '../contexts/CartContext';
import { CheckoutProvider } from '../contexts/CheckoutContext';
import { BookingsProvider } from '../contexts/BookingsContext';
import { SettingsProvider } from '../contexts/SettingsContext';
import { InboxProvider } from '../contexts/InboxContext';
import { ThemeProvider, useAppTheme, toNavigationTheme } from '../contexts/ThemeContext';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SourceSans3_300Light,
    SourceSans3_400Regular,
    SourceSans3_500Medium,
    SourceSans3_600SemiBold,
    SourceSans3_700Bold,
    DanburyCaps: require('../assets/fonts/DanburyCaps.otf'),
    DanburySmall: require('../assets/fonts/DanburySmall.otf'),
  });

  const onLayoutRootView = useCallback(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <AuthProvider>
      <FavoritesProvider>
        <CartProvider>
        <CheckoutProvider>
        <BookingsProvider>
        <SettingsProvider>
        <InboxProvider>
        <ThemeProvider>
          <RootNavigator onLayoutRootView={onLayoutRootView} />
        </ThemeProvider>
        </InboxProvider>
        </SettingsProvider>
        </BookingsProvider>
        </CheckoutProvider>
        </CartProvider>
      </FavoritesProvider>
    </AuthProvider>
  );
}

function RootNavigator({ onLayoutRootView }) {
  const { colors, isDark } = useAppTheme();
  const navTheme = useMemo(() => toNavigationTheme(colors, isDark), [colors, isDark]);

  const themedHeader = {
    headerTintColor: colors.textPrimary,
    headerStyle: { backgroundColor: colors.surface },
    headerTitleStyle: { fontFamily: FONTS.semiBold },
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} onLayout={onLayoutRootView}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <NavigationThemeProvider value={navTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          {/* title here is only used as the back-button fallback label for
              screens pushed straight from a tab (e.g. Inbox, Settings) that
              don't set their own headerBackTitle - without it, React
              Navigation falls back to the literal route name "(tabs)". */}
          <Stack.Screen name="(tabs)" options={{ title: 'Account' }} />
          <Stack.Screen name="car/[id]" options={{ headerShown: false }} />
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
          <Stack.Screen
            name="inbox/[id]"
            options={{ headerShown: true, title: 'Conversation', headerBackTitle: 'Inbox', ...themedHeader }}
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
            name="settings/index"
            options={{ headerShown: true, title: 'Settings', ...themedHeader }}
          />
          <Stack.Screen
            name="settings/about"
            options={{ headerShown: true, title: 'About WopeCar', headerBackTitle: 'Settings', ...themedHeader }}
          />
          <Stack.Screen
            name="settings/help-centre"
            options={{ headerShown: true, title: 'Help Centre', headerBackTitle: 'Settings', ...themedHeader }}
          />
          <Stack.Screen
            name="settings/safety-centre"
            options={{ headerShown: true, title: 'Safety Centre', headerBackTitle: 'Settings', ...themedHeader }}
          />
        </Stack>
      </NavigationThemeProvider>
    </View>
  );
}
