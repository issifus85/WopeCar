import { useCallback } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import {
  SourceSans3_300Light,
  SourceSans3_400Regular,
  SourceSans3_500Medium,
  SourceSans3_600SemiBold,
  SourceSans3_700Bold,
} from '@expo-google-fonts/source-sans-3';
import * as SplashScreen from 'expo-splash-screen';
import { COLORS, FONTS } from '../constants/theme';
import { AuthProvider } from '../contexts/AuthContext';
import { FavoritesProvider } from '../contexts/FavoritesContext';
import { CartProvider } from '../contexts/CartContext';
import { CheckoutProvider } from '../contexts/CheckoutContext';
import { BookingsProvider } from '../contexts/BookingsContext';
import { SettingsProvider } from '../contexts/SettingsContext';

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
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <AuthProvider>
        <FavoritesProvider>
          <CartProvider>
          <CheckoutProvider>
          <BookingsProvider>
          <SettingsProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="car/[id]" options={{ headerShown: false }} />
              <Stack.Screen
                name="booking/[id]"
                options={{
                  headerShown: true,
                  title: 'Booking Details',
                  headerBackTitle: 'Bookings',
                  headerTintColor: COLORS.navy,
                  headerTitleStyle: { fontFamily: FONTS.semiBold },
                }}
              />
              <Stack.Screen
                name="login"
                options={{
                  headerShown: true,
                  title: '',
                  headerTransparent: true,
                  headerTintColor: COLORS.white,
                }}
              />
              <Stack.Screen
                name="account"
                options={{
                  headerShown: true,
                  title: 'Account',
                  headerBackTitle: 'Account',
                  headerTintColor: COLORS.navy,
                  headerTitleStyle: { fontFamily: FONTS.semiBold },
                }}
              />
              <Stack.Screen
                name="inbox"
                options={{
                  headerShown: true,
                  title: 'Inbox',
                  headerTintColor: COLORS.navy,
                  headerTitleStyle: { fontFamily: FONTS.semiBold },
                }}
              />
              <Stack.Screen
                name="documents"
                options={{
                  headerShown: true,
                  title: 'Documents',
                  headerTintColor: COLORS.navy,
                  headerTitleStyle: { fontFamily: FONTS.semiBold },
                }}
              />
              <Stack.Screen
                name="terms"
                options={{
                  headerShown: true,
                  title: 'Terms of Service',
                  headerTintColor: COLORS.navy,
                  headerTitleStyle: { fontFamily: FONTS.semiBold },
                }}
              />
              <Stack.Screen
                name="privacy"
                options={{
                  headerShown: true,
                  title: 'Privacy Policy',
                  headerTintColor: COLORS.navy,
                  headerTitleStyle: { fontFamily: FONTS.semiBold },
                }}
              />
              <Stack.Screen
                name="settings/index"
                options={{
                  headerShown: true,
                  title: 'Settings',
                  headerBackTitle: 'Settings',
                  headerTintColor: COLORS.navy,
                  headerTitleStyle: { fontFamily: FONTS.semiBold },
                }}
              />
              <Stack.Screen
                name="settings/about"
                options={{
                  headerShown: true,
                  title: 'About WopeCar',
                  headerBackTitle: 'Settings',
                  headerTintColor: COLORS.navy,
                  headerTitleStyle: { fontFamily: FONTS.semiBold },
                }}
              />
              <Stack.Screen
                name="settings/help-centre"
                options={{
                  headerShown: true,
                  title: 'Help Centre',
                  headerBackTitle: 'Settings',
                  headerTintColor: COLORS.navy,
                  headerTitleStyle: { fontFamily: FONTS.semiBold },
                }}
              />
              <Stack.Screen
                name="settings/safety-centre"
                options={{
                  headerShown: true,
                  title: 'Safety Centre',
                  headerBackTitle: 'Settings',
                  headerTintColor: COLORS.navy,
                  headerTitleStyle: { fontFamily: FONTS.semiBold },
                }}
              />
            </Stack>
          </SettingsProvider>
          </BookingsProvider>
          </CheckoutProvider>
          </CartProvider>
        </FavoritesProvider>
      </AuthProvider>
    </View>
  );
}
