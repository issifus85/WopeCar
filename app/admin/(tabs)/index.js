import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { formatCurrency } from '../../../constants/pricing';
import { formatRelativeTime } from '../../../constants/dateUtils';
import StatCard from '../../../components/admin/StatCard';
import { getDashboardStats, getPendingCounts, getRecentActivity } from '../../../services/adminDashboardApi';

const MANAGE_LINKS = [
  { key: 'vendors', icon: 'briefcase-outline', label: 'Vendors', route: '/admin/vendors' },
  { key: 'inbox', icon: 'chatbubbles-outline', label: 'Inbox', route: '/admin/inbox' },
  { key: 'cars', icon: 'car-sport-outline', label: 'Cars', route: '/admin/cars' },
];

function QuickAction({ icon, label, count, onPress, styles, colors }) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress}>
      <View style={styles.quickActionIcon}>
        <Ionicons name={icon} size={20} color={colors.teal} />
        {count > 0 && (
          <View style={styles.quickActionBadge}>
            <Text style={styles.quickActionBadgeText}>{count > 99 ? '99+' : count}</Text>
          </View>
        )}
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState(null);
  const [activity, setActivity] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [statsData, pendingData, activityData] = await Promise.all([
        getDashboardStats(),
        getPendingCounts(),
        getRecentActivity(),
      ]);
      setStats(statsData);
      setPending(pendingData);
      setActivity(activityData);
    } catch (e) {
      setError(e.message || 'Could not load dashboard data.');
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    load().finally(() => setIsLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.teal} />}
    >
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <Text style={styles.sectionTitle}>Overview</Text>
      <View style={styles.statsGrid}>
        <StatCard icon="people-outline" label="Total Users" value={stats?.totalUsers ?? 0} />
        <StatCard icon="briefcase-outline" label="Total Vendors" value={stats?.totalVendors ?? 0} />
        <StatCard icon="car-sport-outline" label="Active Listings" value={stats?.activeListings ?? 0} />
        <StatCard icon="calendar-outline" label="Bookings This Month" value={stats?.bookingsThisMonth ?? 0} />
      </View>
      <View style={styles.revenueCard}>
        <View style={styles.revenueIconWrap}>
          <Ionicons name="cash-outline" size={20} color={colors.white} />
        </View>
        <View>
          <Text style={styles.revenueLabel}>Revenue This Month</Text>
          <Text style={styles.revenueValue}>{formatCurrency(stats?.revenueThisMonth ?? 0)}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.quickActionsGrid}>
        <QuickAction
          icon="checkmark-done-outline"
          label="Pending Approvals"
          count={pending?.pendingApprovals ?? 0}
          onPress={() => router.push('/admin/vendors')}
          styles={styles}
          colors={colors}
        />
        <QuickAction
          icon="hourglass-outline"
          label="Pending Bookings"
          count={pending?.pendingBookings ?? 0}
          onPress={() => router.push('/admin/bookings')}
          styles={styles}
          colors={colors}
        />
        <QuickAction
          icon="chatbubbles-outline"
          label="Support Messages"
          count={pending?.unreadSupportMessages ?? 0}
          onPress={() => router.push('/admin/inbox')}
          styles={styles}
          colors={colors}
        />
        <QuickAction
          icon="people-outline"
          label="Users"
          onPress={() => router.push('/admin/users')}
          styles={styles}
          colors={colors}
        />
      </View>

      <Text style={styles.sectionTitle}>Manage</Text>
      <View style={styles.manageGrid}>
        {MANAGE_LINKS.map((link) => (
          <TouchableOpacity key={link.key} style={styles.manageTile} onPress={() => router.push(link.route)}>
            <Ionicons name={link.icon} size={20} color={colors.teal} />
            <Text style={styles.manageTileLabel}>{link.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Recent Activity</Text>
      <View style={styles.activityList}>
        {activity.length === 0 ? (
          <Text style={styles.emptyText}>No recent activity.</Text>
        ) : (
          activity.map((item) => (
            <View key={item.id} style={styles.activityRow}>
              <View style={styles.activityIcon}>
                <Ionicons name={item.icon} size={16} color={colors.teal} />
              </View>
              <View style={styles.activityInfo}>
                <Text style={styles.activityTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.activitySubtitle} numberOfLines={1}>{item.subtitle}</Text>
              </View>
              <Text style={styles.activityTime}>{formatRelativeTime(item.createdAt)}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    content: {
      padding: 16,
      paddingBottom: 140,
    },
    errorText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.error,
      marginBottom: 12,
      textAlign: 'center',
    },
    sectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: 12,
      marginTop: 4,
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    revenueCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.teal,
      borderRadius: 14,
      padding: 16,
      marginBottom: 24,
    },
    revenueIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    revenueLabel: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: 'rgba(255,255,255,0.85)',
    },
    revenueValue: {
      fontFamily: FONTS.bold,
      fontSize: 20,
      color: colors.white,
      marginTop: 2,
    },
    quickActionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 24,
    },
    quickAction: {
      flexBasis: '47%',
      flexGrow: 1,
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      alignItems: 'center',
      gap: 8,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    quickActionIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickActionBadge: {
      position: 'absolute',
      top: -4,
      right: -6,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      backgroundColor: colors.error,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickActionBadgeText: {
      fontFamily: FONTS.bold,
      fontSize: 10,
      color: colors.white,
    },
    quickActionLabel: {
      fontFamily: FONTS.semiBold,
      fontSize: 11,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    manageGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 24,
    },
    manageTile: {
      flexBasis: '31%',
      flexGrow: 1,
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingVertical: 16,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    manageTileLabel: {
      fontFamily: FONTS.semiBold,
      fontSize: 12,
      color: colors.textPrimary,
    },
    activityList: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingHorizontal: 14,
    },
    emptyText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      textAlign: 'center',
      paddingVertical: 20,
    },
    activityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    activityIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    activityInfo: {
      flex: 1,
    },
    activityTitle: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
    },
    activitySubtitle: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
      marginTop: 1,
    },
    activityTime: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
    },
  });
}
