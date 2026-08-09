import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, RefreshControl, ActivityIndicator, Modal, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { formatCurrency } from '../../../constants/pricing';
import FilterTabs from '../../../components/admin/FilterTabs';
import BadgeStatus from '../../../components/admin/BadgeStatus';
import { listBookings } from '../../../services/adminBookingsApi';
import { WEEKDAYS, MONTH_NAMES, stripTime, buildMonthGrid } from '../../../services/vendorCalendar';

const STATUS_TONE = { pending: 'warning', confirmed: 'success', cancelled: 'error', completed: 'muted' };

// A booking's start/end date is a calendar date, not an instant - parsing it
// via `new Date('2026-09-01')` reads it as UTC midnight, which shifts to the
// previous day in any timezone behind UTC (e.g. America/New_York renders it
// as Aug 31). Splitting the literal Y/M/D and constructing a local Date
// avoids that round-trip entirely, so the calendar always marks the date
// that was actually typed, regardless of the viewer's timezone.
function parseDateOnly(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function BookingCard({ booking, onPress, styles, colors }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.topRow}>
        <Text style={styles.ref}>{booking.booking_ref}</Text>
        <View style={styles.badgeGroup}>
          {!!booking.wopecare_plan && booking.wopecare_plan !== 'none' && <BadgeStatus label="WopeCare" tone="neutral" />}
          {booking.payment_status === 'paid' && <BadgeStatus label="Paid" tone="success" />}
          <BadgeStatus label={booking.status} tone={STATUS_TONE[booking.status] || 'muted'} />
        </View>
      </View>
      <Text style={styles.carName} numberOfLines={1}>{booking.cars?.name || 'Unknown car'}</Text>
      <Text style={styles.renterName} numberOfLines={1}>{booking.renter?.full_name || 'Unknown renter'}</Text>
      <View style={styles.bottomRow}>
        <Text style={styles.dates}>{booking.start_date} → {booking.end_date}</Text>
        <Text style={styles.total}>{formatCurrency(booking.total_cost)}</Text>
      </View>
    </TouchableOpacity>
  );
}

// Denser single-row alternative to BookingCard, for scanning many bookings
// at once rather than reading each one in full.
function CompactBookingRow({ booking, onPress, styles, colors }) {
  return (
    <TouchableOpacity style={styles.compactRow} onPress={onPress}>
      <View style={styles.compactMain}>
        <Text style={styles.compactRef} numberOfLines={1}>{booking.booking_ref}</Text>
        <Text style={styles.compactSubtext} numberOfLines={1}>
          {booking.cars?.name || 'Unknown car'} · {booking.renter?.full_name || 'Unknown renter'} · {booking.start_date} → {booking.end_date}
        </Text>
      </View>
      <View style={styles.compactRight}>
        <Text style={styles.compactTotal}>{formatCurrency(booking.total_cost)}</Text>
        <View style={styles.badgeGroup}>
          {!!booking.wopecare_plan && booking.wopecare_plan !== 'none' && <BadgeStatus label="WopeCare" tone="neutral" />}
          {booking.payment_status === 'paid' && <BadgeStatus label="Paid" tone="success" />}
          <BadgeStatus label={booking.status} tone={STATUS_TONE[booking.status] || 'muted'} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function AdminBookingsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [tab, setTab] = useState('all');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'compact'
  const [bookings, setBookings] = useState([]);
  const [confirmedBookings, setConfirmedBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const today = stripTime(new Date());
  const [calendarMonth, setCalendarMonth] = useState(today);
  const [selectedDay, setSelectedDay] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [tabData, confirmedData] = await Promise.all([
        listBookings(tab),
        tab === 'confirmed' ? Promise.resolve(null) : listBookings('confirmed'),
      ]);
      setBookings(tabData);
      if (confirmedData) setConfirmedBookings(confirmedData);
      else setConfirmedBookings(tabData);
    } catch (e) {
      setError(e.message || 'Could not load bookings.');
    }
  }, [tab]);

  useEffect(() => {
    setIsLoading(true);
    load().finally(() => setIsLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  const confirmedRanges = useMemo(() => (
    confirmedBookings
      .filter((b) => b.start_date && b.end_date)
      .map((b) => ({ booking: b, start: parseDateOnly(b.start_date), end: parseDateOnly(b.end_date) }))
  ), [confirmedBookings]);

  const bookingsOnDay = useCallback((day) => (
    confirmedRanges.filter((r) => day >= r.start && day <= r.end).map((r) => r.booking)
  ), [confirmedRanges]);

  const goToMonth = (offset) => {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1));
  };

  const cells = useMemo(() => buildMonthGrid(calendarMonth), [calendarMonth]);
  const selectedDayBookings = selectedDay ? bookingsOnDay(selectedDay) : [];

  const goToBooking = (id) => {
    setSelectedDay(null);
    router.push(`/admin/booking/${id}`);
  };

  const listHeader = (
    <>
      <View style={styles.calendarCard}>
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => goToMonth(-1)} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{MONTH_NAMES[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</Text>
          <TouchableOpacity onPress={() => goToMonth(1)} hitSlop={10}>
            <Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.weekdayRow}>
          {WEEKDAYS.map((w) => <Text key={w} style={styles.weekdayText}>{w}</Text>)}
        </View>

        <View style={styles.grid}>
          {cells.map((day, index) => {
            if (!day) return <View key={`empty-${index}`} style={styles.dayCell} />;
            const isToday = day.getTime() === today.getTime();
            const hasConfirmed = bookingsOnDay(day).length > 0;
            return (
              <TouchableOpacity key={day.toISOString()} style={styles.dayCell} onPress={() => setSelectedDay(day)}>
                <View style={[styles.dayInner, isToday && styles.dayInnerToday]}>
                  <Text style={[styles.dayText, isToday && styles.dayTextToday]}>{day.getDate()}</Text>
                  <View style={styles.dotSlot}>
                    {hasConfirmed && <View style={styles.dot} />}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.calendarHint}>Dates with a dot have confirmed bookings. Tap a date to see them.</Text>
      </View>

      <View style={styles.toolbarRow}>
        <View style={styles.toolbarTabsWrap}>
          <FilterTabs
            tabs={[
              { key: 'all', label: 'All' },
              { key: 'pending', label: 'Pending' },
              { key: 'confirmed', label: 'Confirmed' },
              { key: 'cancelled', label: 'Cancelled' },
              { key: 'completed', label: 'Completed' },
              { key: 'paid', label: 'Paid' },
            ]}
            activeKey={tab}
            onChange={setTab}
          />
        </View>
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.viewToggleButton, viewMode === 'list' && styles.viewToggleButtonActive]}
            onPress={() => setViewMode('list')}
          >
            <Ionicons name="list" size={18} color={viewMode === 'list' ? colors.white : colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewToggleButton, viewMode === 'compact' && styles.viewToggleButtonActive]}
            onPress={() => setViewMode('compact')}
          >
            <Ionicons name="reorder-three" size={18} color={viewMode === 'compact' ? colors.white : colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </>
  );

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ActivityIndicator size="large" color={colors.teal} style={styles.loading} />
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            viewMode === 'compact' ? (
              <CompactBookingRow
                booking={item}
                onPress={() => router.push(`/admin/booking/${item.id}`)}
                styles={styles}
                colors={colors}
              />
            ) : (
              <BookingCard
                booking={item}
                onPress={() => router.push(`/admin/booking/${item.id}`)}
                styles={styles}
                colors={colors}
              />
            )
          )}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.teal} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No bookings.</Text>}
        />
      )}

      <Modal visible={!!selectedDay} transparent animationType="fade" onRequestClose={() => setSelectedDay(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSelectedDay(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>
              {selectedDay ? `${MONTH_NAMES[selectedDay.getMonth()]} ${selectedDay.getDate()}, ${selectedDay.getFullYear()}` : ''}
            </Text>
            {selectedDayBookings.length === 0 ? (
              <Text style={styles.sheetEmpty}>No confirmed bookings on this date.</Text>
            ) : (
              selectedDayBookings.map((booking) => (
                <TouchableOpacity key={booking.id} style={styles.sheetRow} onPress={() => goToBooking(booking.id)}>
                  <View style={styles.sheetRowInfo}>
                    <Text style={styles.sheetRef}>{booking.booking_ref}</Text>
                    <Text style={styles.sheetCarName} numberOfLines={1}>
                      {booking.cars?.name || 'Unknown car'} · {booking.renter?.full_name || 'Unknown renter'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
                </TouchableOpacity>
              ))
            )}
            <TouchableOpacity style={styles.sheetCloseButton} onPress={() => setSelectedDay(null)}>
              <Text style={styles.sheetCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loading: {
      marginTop: 40,
    },
    errorText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.error,
      textAlign: 'center',
      marginTop: 8,
      marginBottom: 8,
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: 140,
    },
    emptyText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      textAlign: 'center',
      marginTop: 40,
    },

    calendarCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginTop: 16,
      marginBottom: 8,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    monthNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    monthLabel: {
      fontFamily: FONTS.semiBold,
      fontSize: 15,
      color: colors.textPrimary,
    },
    weekdayRow: {
      flexDirection: 'row',
      marginBottom: 4,
    },
    weekdayText: {
      flex: 1,
      textAlign: 'center',
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.textSubtle,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    dayCell: {
      width: '14.28%',
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayInner: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      width: '80%',
      height: '80%',
      borderRadius: 8,
    },
    dayInnerToday: {
      backgroundColor: colors.highlight,
    },
    dayText: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textPrimary,
    },
    dayTextToday: {
      fontFamily: FONTS.bold,
      color: colors.teal,
    },
    dotSlot: {
      height: 5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: colors.teal,
    },
    calendarHint: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
      textAlign: 'center',
      marginTop: 10,
    },

    toolbarRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    toolbarTabsWrap: {
      flex: 1,
    },
    viewToggle: {
      flexDirection: 'row',
      backgroundColor: colors.divider,
      borderRadius: 8,
      padding: 3,
      gap: 2,
      marginRight: 16,
    },
    viewToggleButton: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 6,
    },
    viewToggleButtonActive: {
      backgroundColor: colors.teal,
    },

    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    ref: {
      fontFamily: FONTS.bold,
      fontSize: 13,
      color: colors.textPrimary,
    },
    badgeGroup: {
      flexDirection: 'row',
      gap: 6,
    },
    carName: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
    },
    renterName: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 1,
    },
    bottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    dates: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
    },
    total: {
      fontFamily: FONTS.bold,
      fontSize: 13,
      color: colors.textPrimary,
    },

    compactRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginBottom: 6,
      shadowColor: colors.shadow,
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    compactMain: {
      flex: 1,
      gap: 1,
    },
    compactRef: {
      fontFamily: FONTS.semiBold,
      fontSize: 12,
      color: colors.textPrimary,
    },
    compactSubtext: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
    },
    compactRight: {
      alignItems: 'flex-end',
      gap: 4,
    },
    compactTotal: {
      fontFamily: FONTS.bold,
      fontSize: 12,
      color: colors.textPrimary,
    },

    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    sheet: {
      width: '100%',
      maxWidth: 380,
      maxHeight: '80%',
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
    },
    sheetTitle: {
      fontFamily: FONTS.bold,
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: 14,
    },
    sheetEmpty: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textSubtle,
      marginBottom: 8,
    },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    sheetRowInfo: {
      flex: 1,
    },
    sheetRef: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
    },
    sheetCarName: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 1,
    },
    sheetCloseButton: {
      marginTop: 16,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: colors.teal,
    },
    sheetCloseButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 14,
    },
  });
}
