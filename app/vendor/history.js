import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { formatCurrency } from '../../constants/pricing';
import { useVendor } from '../../contexts/VendorContext';
import VendorHeader from '../../components/VendorHeader';
import VendorStatusBadge from '../../components/VendorStatusBadge';
import OptionPickerModal from '../../components/OptionPickerModal';

const ALL_TIME = 'All Time';
const ALL_CARS = 'All Cars';

function monthLabel(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function VendorHistoryScreen() {
  const { carId: carIdParam } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const { activeCurrency } = useCurrency();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { cars, bookingHistory, isLoading } = useVendor();

  const [monthFilter, setMonthFilter] = useState(ALL_TIME);
  const [carFilter, setCarFilter] = useState(ALL_CARS);
  const [pickerOpen, setPickerOpen] = useState(null); // 'month' | 'car' | null

  // Reached from a specific car's "View Bookings" row - pre-filter to it.
  useEffect(() => {
    if (!carIdParam || isLoading) return;
    const car = cars.find((c) => c.id === carIdParam);
    if (car) setCarFilter(car.name);
  }, [carIdParam, isLoading, cars]);

  // Defaults to the current month the first time real data exists, so
  // "Monthly total earnings" has a meaningful landing state - see the
  // effect below, guarded so it doesn't fight a user-picked filter.
  const [hasSetDefaultMonth, setHasSetDefaultMonth] = useState(false);
  useEffect(() => {
    if (hasSetDefaultMonth || isLoading || bookingHistory.length === 0) return;
    setMonthFilter(monthLabel(new Date().toISOString()));
    setHasSetDefaultMonth(true);
  }, [hasSetDefaultMonth, isLoading, bookingHistory]);

  const monthOptions = useMemo(() => {
    const months = Array.from(new Set(bookingHistory.map((b) => monthLabel(b.startDate))));
    months.sort((a, b) => new Date(b) - new Date(a));
    return [ALL_TIME, ...months];
  }, [bookingHistory]);

  const carOptions = useMemo(() => [ALL_CARS, ...cars.map((c) => c.name)], [cars]);

  const filtered = useMemo(() => {
    return bookingHistory
      .filter((b) => monthFilter === ALL_TIME || monthLabel(b.startDate) === monthFilter)
      .filter((b) => carFilter === ALL_CARS || b.carName === carFilter)
      .sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
  }, [bookingHistory, monthFilter, carFilter]);

  const totalEarnings = useMemo(() => {
    return filtered
      .filter((b) => b.status === 'Confirmed' || b.status === 'Completed')
      .reduce((sum, b) => sum + (b.earnings ?? 0), 0);
  }, [filtered]);

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <VendorHeader title="Booking History" subtitle="Past and confirmed bookings" onBack={() => router.push('/vendor')} />

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>
          Total Earnings - {monthFilter}{carFilter !== ALL_CARS ? ` - ${carFilter}` : ''}
        </Text>
        <Text style={styles.totalValue}>{formatCurrency(totalEarnings, activeCurrency)}</Text>
      </View>

      <View style={styles.filterRow}>
        <TouchableOpacity style={styles.filterPill} onPress={() => setPickerOpen('month')}>
          <Ionicons name="calendar-outline" size={14} color={colors.teal} />
          <Text style={styles.filterPillText} numberOfLines={1}>{monthFilter}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.textSubtle} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterPill} onPress={() => setPickerOpen('car')}>
          <Ionicons name="car-outline" size={14} color={colors.teal} />
          <Text style={styles.filterPillText} numberOfLines={1}>{carFilter}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.textSubtle} />
        </TouchableOpacity>
      </View>

      {filtered.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="receipt-outline" size={40} color={colors.disabled} />
          <Text style={styles.emptyText}>No bookings match these filters.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.topRow}>
                <Text style={styles.carName} numberOfLines={1}>{item.carName}</Text>
                <VendorStatusBadge status={item.status} />
              </View>
              <Text style={styles.reference}>{item.reference}</Text>
              <Text style={styles.dateRange}>{formatDate(item.startDate)} - {formatDate(item.endDate)}</Text>
              <Text style={styles.earnings}>{formatCurrency(item.earnings, activeCurrency)}</Text>
            </View>
          )}
        />
      )}

      <OptionPickerModal
        visible={pickerOpen === 'month'}
        title="Filter by Month"
        options={monthOptions}
        value={monthFilter}
        onSelect={setMonthFilter}
        onClose={() => setPickerOpen(null)}
      />
      <OptionPickerModal
        visible={pickerOpen === 'car'}
        title="Filter by Car"
        options={carOptions}
        value={carFilter}
        onSelect={setCarFilter}
        onClose={() => setPickerOpen(null)}
      />
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
      gap: 8,
      padding: 20,
    },
    emptyText: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textSubtle,
      textAlign: 'center',
    },
    totalCard: {
      backgroundColor: colors.teal,
      borderRadius: 14,
      padding: 18,
      marginHorizontal: 20,
      marginTop: 20,
    },
    totalLabel: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: 'rgba(255,255,255,0.85)',
      marginBottom: 6,
    },
    totalValue: {
      fontFamily: FONTS.bold,
      fontSize: 26,
      color: colors.white,
    },
    filterRow: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 20,
      marginTop: 16,
      marginBottom: 8,
    },
    filterPill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterPillText: {
      flex: 1,
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.textPrimary,
    },
    list: {
      padding: 20,
      paddingTop: 8,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
      gap: 4,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    carName: {
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.textPrimary,
      flexShrink: 1,
    },
    reference: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.teal,
    },
    dateRange: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textMuted,
    },
    earnings: {
      fontFamily: FONTS.bold,
      fontSize: 15,
      color: colors.textPrimary,
      marginTop: 2,
    },
  });
}
