import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Redirect, useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import FilterTabs from '../../components/admin/FilterTabs';
import BadgeStatus from '../../components/admin/BadgeStatus';
import { FLEET_OFFICER_ENABLED, TRIP_STATUS_LABELS, TRIP_STATUS_TONES, tripTypeLabel, formatTripTime } from '../../constants/fleetOfficer';
import { listMyTrips } from '../../services/officerApi';

const ACTIVE = ['assigned', 'accepted', 'en_route', 'arrived', 'inspecting'];

function accraDateKey(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Accra' });
}

/**
 * Fleet officer area - "My trips". Reached from the Account menu's Fleet Officer row, which only shows for an ACTIVE officer
 * (officer_profiles, migration 0179). Being an officer sits on top of the person's normal account, so "Back to Account" is the
 * switch back to the standard renter / vendor views. Lists the deliveries and collections admin assigned to this officer.
 */
export default function OfficerHomeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [trips, setTrips] = useState([]);
  const [tab, setTab] = useState('today');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const handleBack = useCallback(() => {
    router.replace('/(tabs)/profile');
  }, [router]);

  // Same explicit back as Ride Support (app/staff-inbox/index.js): a root-level screen pushed from inside the (tabs) navigator.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={handleBack} hitSlop={10} style={styles.headerBackButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          <Text style={styles.headerBackLabel}>Account</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleBack, styles, colors]);

  const isOfficer = FLEET_OFFICER_ENABLED && !!user?.isFleetOfficer;

  const load = useCallback(async () => {
    setError(null);
    try {
      setTrips(await listMyTrips());
    } catch (e) {
      setError(e.message || 'Could not load your trips.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (isOfficer) load();
  }, [isOfficer, load]));

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  const groups = useMemo(() => {
    const today = accraDateKey(new Date().toISOString());
    const isDone = (t) => t.status === 'completed';
    return {
      // Today = anything scheduled today, plus anything still open from before (overdue) or already under way.
      today: trips.filter((t) => !isDone(t) && (accraDateKey(t.scheduledAt) <= today || ['en_route', 'arrived', 'inspecting'].includes(t.status))),
      upcoming: trips.filter((t) => !isDone(t) && accraDateKey(t.scheduledAt) > today && !['en_route', 'arrived', 'inspecting'].includes(t.status)),
      done: trips.filter(isDone).reverse(),
    };
  }, [trips]);

  // A deactivated officer (or a production build) never sees this area, even from an old deep link.
  if (!isOfficer) {
    return <Redirect href="/(tabs)/profile" />;
  }

  const officer = user.officerProfile;
  const list = groups[tab];

  return (
    <View style={styles.container}>
      <FlatList
        data={isLoading ? [] : list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={COLORS.teal} />}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>My trips</Text>
              <Text style={styles.headerSubtitle}>
                {officer?.display_name || user.name} · Fleet officer{officer?.vehicle_note ? ` · ${officer.vehicle_note}` : ''}
              </Text>
            </View>
            <FilterTabs
              tabs={[
                { key: 'today', label: 'Today', count: groups.today.length },
                { key: 'upcoming', label: 'Upcoming', count: groups.upcoming.length },
                { key: 'done', label: 'Done', count: groups.done.length },
              ]}
              activeKey={tab}
              onChange={setTab}
            />
            {!!error && <Text style={styles.errorText}>{error}</Text>}
            {isLoading && <ActivityIndicator color={COLORS.teal} style={styles.loading} />}
          </>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => router.push(`/officer/task/${item.id}`)}>
            {item.carImage ? (
              <Image source={{ uri: item.carImage }} style={styles.carImage} contentFit="cover" />
            ) : (
              <View style={[styles.carImage, styles.carImagePlaceholder]}>
                <Ionicons name="car-sport-outline" size={22} color={COLORS.teal} />
              </View>
            )}
            <View style={styles.cardInfo}>
              <View style={styles.cardTopLine}>
                <Text style={styles.cardType}>{tripTypeLabel(item.type, item.driveType)}</Text>
                <BadgeStatus label={TRIP_STATUS_LABELS[item.status] || item.status} tone={TRIP_STATUS_TONES[item.status]} />
              </View>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.carName || 'Car'}{item.bookingRef ? ` · ${item.bookingRef}` : ''}</Text>
              <Text style={styles.cardLine} numberOfLines={1}>{formatTripTime(item.scheduledAt)}</Text>
              <Text style={styles.cardLine} numberOfLines={1}>
                {item.type === 'delivery' ? item.toAddress : item.fromAddress || item.toAddress || 'Place to be confirmed'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-clear-outline" size={32} color={colors.disabled} />
              <Text style={styles.emptyStateTitle}>{tab === 'done' ? 'No completed trips yet' : 'No trips here'}</Text>
              <Text style={styles.emptyStateText}>When WopeCar assigns you a delivery or collection, you get a notification and it appears here.</Text>
            </View>
          )
        }
        ListFooterComponent={
          <TouchableOpacity style={styles.switchButton} onPress={handleBack}>
            <Ionicons name="swap-horizontal-outline" size={18} color={colors.textPrimary} />
            <Text style={styles.switchButtonText}>Back to renter & vendor views</Text>
          </TouchableOpacity>
        }
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    headerBackButton: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
    headerBackLabel: { fontFamily: FONTS.regular, fontSize: 17, color: colors.textPrimary, marginLeft: -4 },
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: 140 },
    header: { paddingTop: 20, paddingHorizontal: 16, paddingBottom: 12 },
    headerTitle: { fontFamily: FONTS.bold, fontSize: 20, color: colors.textPrimary },
    headerSubtitle: { fontFamily: FONTS.regular, fontSize: 12, color: colors.textSubtle, marginTop: 2 },
    errorText: { fontFamily: FONTS.regular, fontSize: 13, color: colors.error, paddingHorizontal: 16, paddingVertical: 8 },
    loading: { marginTop: 40 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 10, padding: 12,
      backgroundColor: colors.surface, borderRadius: 12, shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    },
    carImage: { width: 64, height: 64, borderRadius: 10 },
    carImagePlaceholder: { backgroundColor: colors.highlight, alignItems: 'center', justifyContent: 'center' },
    cardInfo: { flex: 1, gap: 2 },
    cardTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    cardType: { fontFamily: FONTS.semiBold, fontSize: 12, color: COLORS.teal, textTransform: 'uppercase' },
    cardTitle: { fontFamily: FONTS.semiBold, fontSize: 15, color: colors.textPrimary },
    cardLine: { fontFamily: FONTS.regular, fontSize: 12, color: colors.textSubtle },
    emptyState: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 64, paddingHorizontal: 32 },
    emptyStateTitle: { fontFamily: FONTS.semiBold, fontSize: 15, color: colors.textPrimary },
    emptyStateText: { fontFamily: FONTS.regular, fontSize: 13, color: colors.textSubtle, textAlign: 'center' },
    switchButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginTop: 24,
      paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    },
    switchButtonText: { fontFamily: FONTS.medium, fontSize: 14, color: colors.textPrimary },
  });
}
