import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useCurrency } from '../../../contexts/CurrencyContext';
import { formatCurrency } from '../../../constants/pricing';
import { useVendor } from '../../../contexts/VendorContext';
import { useSettings } from '../../../contexts/SettingsContext';
import { useAuth } from '../../../contexts/AuthContext';
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
    isRefreshing,
    hasLoadError,
    vendorProfile,
    isVendorApproved,
    fleetSize,
    currentMonthEarnings,
    bookingsThisMonthCount,
    bookingRequests,
    earningsHistory,
    refreshVendorData,
  } = useVendor();
  const { settings, updateSetting } = useSettings();
  const { user, isLoading: isAuthLoading } = useAuth();

  // Every path into Vendor Mode (the Profile switch, a relaunch redirect, a
  // direct link) converges on this Dashboard mount - so this is the one
  // place that needs to verify a real vendor row exists before treating the
  // app as being in Vendor Mode. Signed-out visitors (e.g. a stale local
  // appMode='vendor' setting with no active session) go to /login first -
  // Vendor Mode never had its own auth guard before this, only the appMode
  // check. No vendor row (e.g. a stale pre-gate appMode setting, or a direct
  // deep link with none) bounces to the application screen instead of
  // force-syncing appMode - see app/vendor/apply.js.
  //
  // `vendorProfile` can also be null because VendorContext's own fetch
  // timed out/failed (see contexts/VendorContext.js's withTimeout), not
  // because this vendor genuinely has no vendor row - an already-approved
  // vendor with a real fleet hitting a one-off network hiccup must never be
  // bounced into the "Become a Vendor" application form. `hasLoadError`
  // distinguishes the two; only a confirmed-empty profile redirects.
  useEffect(() => {
    if (isAuthLoading || isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!vendorProfile) {
      if (!hasLoadError) router.replace('/vendor/apply');
      return;
    }
    if (settings.appMode !== 'vendor') updateSetting('appMode', 'vendor');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, isLoading, user, vendorProfile, hasLoadError]);

  const switchToClientMode = () => {
    updateSetting('appMode', 'client');
    router.replace('/(tabs)/profile');
  };

  if (isAuthLoading || isLoading || !user) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  // Not a genuinely-missing vendor row (that redirects to /vendor/apply
  // above) - the fetch itself failed. A spinner here would just hang
  // forever, since nothing auto-retries once `user` stops changing.
  if (!vendorProfile && hasLoadError) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.disabled} />
        <Text style={styles.errorText}>Couldn't load your vendor account. Check your connection and try again.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refreshVendorData} disabled={isRefreshing}>
          <Text style={styles.retryButtonText}>{isRefreshing ? 'Retrying…' : 'Retry'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!vendorProfile) {
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

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refreshVendorData} tintColor={colors.teal} colors={[colors.teal]} />}
      >
        {!isVendorApproved && (
          <View style={styles.noticeBox}>
            <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
            <Text style={styles.noticeText}>
              Your vendor account is <Text style={styles.noticeBold}>pending verification</Text>. You can list cars
              and manage your fleet now - we'll follow up if we need anything else from you.
            </Text>
          </View>
        )}

        {hasLoadError && (
          // vendorProfile did load here (the dedicated retry screen above
          // handles the case where it didn't) - this means cars/bookings
          // specifically failed to refresh, which would otherwise silently
          // read as "this vendor has zero cars/earnings". Pull-to-refresh is
          // the fix; this just makes clear that's needed instead of implying
          // the numbers below are final.
          <View style={styles.noticeBox}>
            <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
            <Text style={styles.noticeText}>
              Some of your data couldn't be loaded. Pull down to refresh - the numbers below may be incomplete.
            </Text>
          </View>
        )}

        {fleetSize === 0 && !hasLoadError ? (
          // A brand-new vendor has nothing to show in the earnings card,
          // stats row, or 6-month chart below - GH₵0/0/0 and an empty chart
          // read as "something's broken", not "you haven't started yet". A
          // single welcome card with the one real next step (list a car)
          // replaces all three until there's at least one car to report on.
          <View style={styles.welcomeCard}>
            <View style={styles.welcomeIcon}>
              <Ionicons name="car-sport-outline" size={26} color={colors.white} />
            </View>
            <Text style={styles.welcomeTitle}>Welcome to WopeCar Hosting</Text>
            <Text style={styles.welcomeText}>
              List your first car to start earning. It only takes a few minutes, and WopeCar reviews every submission
              before it goes live.
            </Text>
            <TouchableOpacity style={styles.welcomeButton} onPress={() => router.push('/vendor/add-car')}>
              <Text style={styles.welcomeButtonText}>Add Your First Car</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.welcomeSecondaryButton} onPress={() => router.push('/vendor/getting-started')}>
              <Text style={styles.welcomeSecondaryButtonText}>See How Hosting Works</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
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
          </>
        )}

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

        {fleetSize > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.sectionTitle}>Earnings - Last 6 Months</Text>
            <VendorEarningsBarChart data={earningsHistory} />
          </View>
        )}
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
      gap: 12,
      paddingHorizontal: 32,
    },
    errorText: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textSubtle,
      textAlign: 'center',
      lineHeight: 20,
    },
    retryButton: {
      backgroundColor: colors.teal,
      borderRadius: 12,
      paddingHorizontal: 24,
      paddingVertical: 13,
      marginTop: 4,
    },
    retryButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 14,
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
      paddingBottom: 140,
    },
    noticeBox: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: colors.warningBg,
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
    },
    noticeText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 18,
    },
    noticeBold: {
      fontFamily: FONTS.bold,
      color: colors.warning,
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
    welcomeCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 24,
      alignItems: 'center',
      marginBottom: 24,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    welcomeIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.teal,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    welcomeTitle: {
      fontFamily: FONTS.bold,
      fontSize: 17,
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: 8,
    },
    welcomeText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      textAlign: 'center',
      lineHeight: 19,
      marginBottom: 20,
    },
    welcomeButton: {
      alignSelf: 'stretch',
      backgroundColor: colors.teal,
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: 'center',
    },
    welcomeButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 15,
    },
    welcomeSecondaryButton: {
      alignSelf: 'stretch',
      marginTop: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    welcomeSecondaryButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.teal,
      fontSize: 13,
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
