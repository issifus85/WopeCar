import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../../constants/theme';
import { useAppTheme } from '../../../../contexts/ThemeContext';
import { getCar } from '../../../../services/adminCarsApi';
import { getBookingsForCar } from '../../../../services/adminBookingsApi';
import { getBlockedDatesForCars } from '../../../../services/vendorCarsApi';
import {
  WEEKDAYS, MONTH_NAMES, stripTime, toISODate, buildMonthGrid, getDayState,
} from '../../../../services/vendorCalendar';

// Admin's read-only counterpart to app/vendor/car/availability/[id].js - same
// day-state legend (Available/Blocked/Booked) and shared vendorCalendar.js
// grid helpers, but no tap-to-block editing and no availability-settings
// section, since this exists so admin/support can SEE what's already booked
// or vendor-blocked for a car, not manage it (that stays the vendor's own
// tool). Sourced directly from `bookings` + `availability`, scoped by
// car_id, rather than through VendorContext (which is vendor-scoped by
// design and not available in the admin app).
export default function AdminCarAvailabilityScreen() {
  const { id } = useLocalSearchParams();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [car, setCar] = useState(null);
  const [bookedRanges, setBookedRanges] = useState([]);
  const [blockedSet, setBlockedSet] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const today = stripTime(new Date());
  const [viewMonth, setViewMonth] = useState(today);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    Promise.all([
      getCar(id),
      getBookingsForCar(id),
      getBlockedDatesForCars([id]),
    ])
      .then(([carRow, bookings, blockedByCarId]) => {
        if (cancelled) return;
        setCar(carRow);
        setBookedRanges(bookings.map((b) => ({
          start: stripTime(new Date(`${b.start_date}T00:00:00`)),
          end: stripTime(new Date(`${b.end_date}T00:00:00`)),
        })));
        setBlockedSet(new Set(blockedByCarId[id] ?? []));
      })
      .catch((e) => !cancelled && setLoadError(e.message || 'Could not load this car.'))
      .finally(() => !cancelled && setIsLoading(false));
    return () => { cancelled = true; };
  }, [id]);

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  if (!car) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.emptyText}>{loadError || 'This car could not be found.'}</Text>
      </View>
    );
  }

  const goToMonth = (offset) => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + offset, 1));
  const canGoPrev =
    viewMonth.getFullYear() > today.getFullYear() ||
    (viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() > today.getMonth());

  const cells = buildMonthGrid(viewMonth);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{car.name}</Text>
        <Text style={styles.subtitle}>Availability</Text>

        <View style={styles.calendarCard}>
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={() => goToMonth(-1)} disabled={!canGoPrev} hitSlop={10}>
              <Ionicons name="chevron-back" size={22} color={canGoPrev ? colors.textPrimary : colors.disabled} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}</Text>
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

              const state = getDayState(day, { today, bookedRanges, blockedSet });

              return (
                <View key={toISODate(day)} style={styles.dayCell}>
                  <View style={[
                    styles.dayCircle,
                    state === 'available' && styles.dayCircleAvailable,
                    (state === 'blocked' || state === 'sunday') && styles.dayCircleBlocked,
                    state === 'booked' && styles.dayCircleBooked,
                    state === 'past' && styles.dayCirclePast,
                  ]}>
                    <Text style={[
                      styles.dayText,
                      state === 'available' && styles.dayTextAvailable,
                      (state === 'blocked' || state === 'sunday') && styles.dayTextBlocked,
                      state === 'booked' && styles.dayTextBooked,
                      state === 'past' && styles.dayTextPast,
                    ]}>
                      {day.getDate()}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
            <Text style={styles.legendText}>Available</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
            <Text style={styles.legendText}>Blocked</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.info }]} />
            <Text style={styles.legendText}>Booked</Text>
          </View>
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
      gap: 8,
      padding: 20,
    },
    emptyText: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textSubtle,
      textAlign: 'center',
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    title: {
      fontFamily: FONTS.bold,
      fontSize: 18,
      color: colors.textPrimary,
    },
    subtitle: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      marginTop: 2,
      marginBottom: 16,
    },
    calendarCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
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
    dayCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayCircleAvailable: {
      backgroundColor: colors.successBg,
    },
    dayCircleBlocked: {
      backgroundColor: colors.errorBg,
    },
    dayCircleBooked: {
      backgroundColor: colors.infoBg,
    },
    dayCirclePast: {
      backgroundColor: 'transparent',
    },
    dayText: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textPrimary,
    },
    dayTextAvailable: {
      color: colors.success,
    },
    dayTextBlocked: {
      color: colors.error,
    },
    dayTextBooked: {
      color: colors.info,
    },
    dayTextPast: {
      color: colors.disabled,
    },
    legendRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 20,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    legendDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    legendText: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textMuted,
    },
  });
}
