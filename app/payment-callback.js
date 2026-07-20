import { useEffect } from 'react';
import { View, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { COLORS } from '../constants/theme';

export default function PaymentCallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Signals the popup opened by WebBrowser.openAuthSessionAsync to
      // hand its result back to the opener and close itself.
      WebBrowser.maybeCompleteAuthSession();
    } else {
      router.replace('/(tabs)/bookings');
    }
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.teal} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
