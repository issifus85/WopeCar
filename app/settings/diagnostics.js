import { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Platform, Dimensions, Linking } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useSettings } from '../../contexts/SettingsContext';
import { API_BASE_URL } from '../../services/api';

const SUPPORT_EMAIL = 'support@wopecar.com';
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

function Row({ label, value, last, styles }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

// No crash-reporting SDK is installed in this app - rather than fake a
// "Diagnostics" toggle for a service that isn't wired up, this pulls
// together real, already-available on-device/app state into a report the
// user can send to Support by email. Nothing here is fabricated.
export default function DiagnosticsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { activeCurrency } = useCurrency();
  const { settings } = useSettings();

  const { width, height } = Dimensions.get('window');

  const report = useMemo(() => ({
    'App Version': APP_VERSION,
    'Build Number': String(
      Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode ?? 'N/A'
    ),
    Platform: `${Platform.OS} ${Platform.Version ?? ''}`.trim(),
    'Screen Size': `${Math.round(width)}×${Math.round(height)}`,
    'API Endpoint': API_BASE_URL,
    'App Mode': settings.appMode === 'vendor' ? 'Host' : 'Renter',
    Currency: activeCurrency?.code ?? 'N/A',
    'Dark Mode': settings.darkMode,
  }), [width, height, settings.appMode, settings.darkMode, activeCurrency?.code]);

  const handleEmailReport = () => {
    const bodyLines = Object.entries(report).map(([key, value]) => `${key}: ${value}`);
    const body = encodeURIComponent(`Describe the issue you're seeing:\n\n\n---\n${bodyLines.join('\n')}`);
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('WopeCar Diagnostics Report')}&body=${body}`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>
        A snapshot of your app and device state - useful for Support to troubleshoot an issue. Nothing here is sent
        anywhere unless you choose to email it below.
      </Text>

      <View style={styles.card}>
        {Object.entries(report).map(([label, value], index, arr) => (
          <Row key={label} label={label} value={value} last={index === arr.length - 1} styles={styles} />
        ))}
      </View>

      <TouchableOpacity style={styles.ctaButton} onPress={handleEmailReport}>
        <Ionicons name="mail-outline" size={18} color={colors.white} />
        <Text style={styles.ctaButtonText}>Email Report to Support</Text>
      </TouchableOpacity>
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
    rowLast: {
      borderBottomWidth: 0,
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
      fontSize: 13,
      color: colors.textSubtle,
    },
    ctaButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.teal,
      borderRadius: 12,
      paddingVertical: 15,
    },
    ctaButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.white,
    },
  });
}
