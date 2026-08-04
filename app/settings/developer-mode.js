import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { API_BASE_URL } from '../../services/api';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

function Row({ label, value, styles }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={3}>{String(value)}</Text>
    </View>
  );
}

// Unlocked by tapping "App Version" 7 times in Settings > Developer (see
// app/settings/index.js) - a plain read-only inspector over real internal
// app state, no fake feature flags or toggles that don't do anything.
export default function DeveloperModeScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { settings } = useSettings();
  const { activeCurrency, currencies } = useCurrency();
  const [biometricHardware, setBiometricHardware] = useState('Checking...');

  useEffect(() => {
    if (Platform.OS === 'web') {
      setBiometricHardware('Not available on web');
      return;
    }
    Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()])
      .then(([hasHardware, isEnrolled]) => {
        if (!hasHardware) return setBiometricHardware('No hardware');
        setBiometricHardware(isEnrolled ? 'Enrolled' : 'Hardware present, not enrolled');
      })
      .catch(() => setBiometricHardware('Unknown'));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>Internal state for debugging - not meant for general use.</Text>

      <Text style={styles.sectionTitle}>Environment</Text>
      <View style={styles.card}>
        <Row label="App Version" value={APP_VERSION} styles={styles} />
        <Row label="Runtime Version" value={Constants.expoConfig?.runtimeVersion ?? 'N/A'} styles={styles} />
        <Row label="Expo SDK" value={Constants.expoConfig?.sdkVersion ?? 'N/A'} styles={styles} />
        <Row label="API Base URL" value={API_BASE_URL} styles={styles} />
        <Row label="Platform" value={`${Platform.OS} ${Platform.Version ?? ''}`.trim()} styles={styles} />
        <Row label="Biometric Hardware" value={biometricHardware} styles={styles} />
      </View>

      <Text style={styles.sectionTitle}>Live Settings State</Text>
      <View style={styles.card}>
        <Row label="App Mode" value={settings.appMode} styles={styles} />
        <Row label="Currency" value={`${activeCurrency?.code ?? 'N/A'} (${currencies.length} available)`} styles={styles} />
        <Row label="Dark Mode" value={settings.darkMode} styles={styles} />
        <Row label="Map Provider" value={settings.mapProvider} styles={styles} />
        <Row label="Biometric Login Setting" value={settings.biometricLogin ? 'On' : 'Off'} styles={styles} />
        <Row label="Auto-open Directions" value={settings.autoOpenDirections ? 'On' : 'Off'} styles={styles} />
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: 16,
    },
    intro: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      lineHeight: 19,
      marginBottom: 16,
    },
    sectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 12,
      color: colors.textSubtle,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
      marginLeft: 4,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingHorizontal: 16,
      marginBottom: 20,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 13,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    rowLabel: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textPrimary,
    },
    rowValue: {
      flexShrink: 1,
      textAlign: 'right',
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
    },
  });
}
