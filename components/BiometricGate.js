import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';

// Face ID / Fingerprint isn't available on web, and there's nothing to
// protect until AuthContext has resolved whether a session exists - this
// only ever locks a session that's *already there*, it never blocks the
// logged-out/browsing experience.
function shouldGate({ isBiometricLoginOn, isAuthLoading, user }) {
  return Platform.OS !== 'web' && isBiometricLoginOn && !isAuthLoading && !!user;
}

export default function BiometricGate({ children }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, isLoading: isAuthLoading } = useAuth();
  const { settings, isLoading: isSettingsLoading } = useSettings();

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isPrompting, setIsPrompting] = useState(false);
  const [failed, setFailed] = useState(false);

  const gateActive = !isSettingsLoading && shouldGate({
    isBiometricLoginOn: settings.biometricLogin,
    isAuthLoading,
    user,
  });

  const promptUnlock = async () => {
    setIsPrompting(true);
    setFailed(false);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock WopeCar',
        disableDeviceFallback: false,
      });
      if (result.success) {
        setIsUnlocked(true);
      } else {
        setFailed(true);
      }
    } finally {
      setIsPrompting(false);
    }
  };

  useEffect(() => {
    if (gateActive && !isUnlocked && !isPrompting) {
      promptUnlock();
    }
    // Re-lock if the user who unlocked signs out and a different session
    // resumes later (e.g. a shared device).
    if (!gateActive) setIsUnlocked(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateActive]);

  if (!gateActive || isUnlocked) {
    return children;
  }

  return (
    <View style={styles.container}>
      <Ionicons name="lock-closed" size={48} color={colors.teal} />
      <Text style={styles.title}>WopeCar is locked</Text>
      <Text style={styles.subtitle}>
        {failed ? "Couldn't verify it's you - try again." : 'Unlock with Face ID / Fingerprint to continue.'}
      </Text>
      <TouchableOpacity style={styles.button} onPress={promptUnlock} disabled={isPrompting}>
        <Text style={styles.buttonText}>{isPrompting ? 'Verifying...' : 'Unlock'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingHorizontal: 40,
      backgroundColor: colors.background,
    },
    title: {
      fontFamily: FONTS.bold,
      fontSize: 18,
      color: colors.textPrimary,
      marginTop: 8,
    },
    subtitle: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      textAlign: 'center',
      marginBottom: 12,
    },
    button: {
      backgroundColor: colors.teal,
      borderRadius: 10,
      paddingHorizontal: 24,
      paddingVertical: 12,
    },
    buttonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.white,
    },
  });
}
