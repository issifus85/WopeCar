import { useEffect, useMemo } from 'react';
import { View, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../contexts/ThemeContext';

export default function PaymentCallbackScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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
      <ActivityIndicator size="large" color={colors.teal} />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
  });
}
