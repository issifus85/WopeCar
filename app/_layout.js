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
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="car/[id]"
          options={{
            headerShown: true,
            title: 'Car Details',
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
      </Stack>
    </View>
  );
}
