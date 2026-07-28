import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useCurrency } from '../../../contexts/CurrencyContext';
import { formatCurrency } from '../../../constants/pricing';
import { useVendor } from '../../../contexts/VendorContext';
import { useSettings } from '../../../contexts/SettingsContext';
import VendorEarningsBarChart from '../../../components/VendorEarningsBarChart';

const QUICK_ACTIONS = [
  { key: 'fleet', label: 'My Fleet', icon: 'car-sport-outline', route: '/vendor/fleet' },
  { key: 'bookings', label: 'Bookings', icon: 'notifications-outline', route: '/vendor/bookings' },
  { key: 'history', label: 'History', icon: 'time-outline', route: '/vendor/history' },
  { key: 'support', label: 'Support', icon: 'chatbubbles-outline', route: '/vendor/support' },
];

export default function VendorDashboardScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { activeCurrency } = useCurrency();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    isLoading,
    fleetSize,
    currentMonthEarnings,
    bookingsThisMonthCount,
    bookingRequests,
    earningsHistory,
  } = useVendor();
  const { settings, updateSetting } = useSettings();

  // Reaching the Vendor Dashboard by any path (the Profile switch, a
  // relaunch redirect, a direct link) means the app should remember Vendor
  // Mode for next launch too - see app/_layout.js's appMode redirect.
  useEffect(() => {
    if (settings.appMode !== 'vendor') updateSetting('appMode', 'vendor');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchToClientMode = () => {
    updateSetting('appMode', 'client');
    router.replace('/(tabs)/profile');
  };

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Host Mode</Text>
          <Text style={styles.headerTitle}>Vendor Dashboard</Text>
        </View>
        <TouchableOpacity
          style={styles.switchModeButton}
          onPress={switchToClientMode}
        >
          <Ionicons name="swap-horizontal-outline" size={15} color={colors.teal} />
          <Text style={styles.switchModeText}>Client Mode</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.earningsCard}>
          <Text style={styles.earningsLabel}>This Month's Earnings</Text>
          <Text style={styles.earningsValue}>{formatCurrency(currentMonthEarnings, activeCurrency)}</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="calendar-outline" size={20} color={colors.teal} />
            <Text style={styles.statValue}>{bookingsThisMonthCount}</Text>
            <Text style={styles.statLabel}>Bookings this month</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="car-outline" size={20} color={colors.teal} />
            <Text style={styles.statValue}>{fleetSize}</Text>
            <Text style={styles.statLabel}>Cars listed</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          {QUICK_ACTIONS.map((action) => {
            const badgeCount = action.key === 'bookings' ? bookingRequests.length : 0;
            return (
              <TouchableOpacity
                key={action.key}
                style={styles.actionTile}
                onPress={() => router.push(action.route)}
              >
                <View style={styles.actionIcon}>
                  <Ionicons name={action.icon} size={22} color={colors.teal} />
                  {badgeCount > 0 && (
                    <View style={styles.actionBadge}>
                      <Text style={styles.actionBadgeText}>{badgeCount}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.actionLabel}>{action.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.chartCard}>
          <Text style={styles.sectionTitle}>Earnings - Last 6 Months</Text>
          <VendorEarningsBarChart data={earningsHistory} />
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingTop: 60,
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    eyebrow: {
      fontFamily: FONTS.semiBold,
      fontSize: 12,
      color: colors.teal,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    headerTitle: {
      fontFamily: FONTS.bold,
      fontSize: 22,
      color: colors.textPrimary,
    },
    switchModeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 4,
    },
    switchModeText: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.teal,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    earningsCard: {
      backgroundColor: colors.teal,
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
    },
    earningsLabel: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: 'rgba(255,255,255,0.85)',
      marginBottom: 6,
    },
    earningsValue: {
      fontFamily: FONTS.bold,
      fontSize: 30,
      color: colors.white,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 24,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      gap: 6,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    statValue: {
      fontFamily: FONTS.bold,
      fontSize: 22,
      color: colors.textPrimary,
    },
    statLabel: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
    },
    sectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: 12,
    },
    actionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 24,
    },
    actionTile: {
      width: '47%',
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingVertical: 18,
      alignItems: 'center',
      gap: 8,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    actionIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      backgroundColor: colors.error,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionBadgeText: {
      fontFamily: FONTS.bold,
      fontSize: 10,
      color: colors.white,
    },
    actionLabel: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
    },
    chartCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
  });
}
