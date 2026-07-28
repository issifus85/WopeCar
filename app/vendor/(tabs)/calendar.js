import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator, Modal, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useVendor } from '../../../contexts/VendorContext';
import VendorHeader from '../../../components/VendorHeader';
import {
  WEEKDAYS, MONTH_NAMES, stripTime, buildMonthGrid, getDayState, bookedRangesForCar,
} from '../../../services/vendorCalendar';

const STATE_LABEL = {
  available: 'Available',
  blocked: 'Blocked',
  booked: 'Booked',
  past: 'No activity',
};

export default function VendorFleetCalendarScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { cars, blockedDates, bookingHistory, isLoading } = useVendor();

  const today = stripTime(new Date());
  const [viewMonth, setViewMonth] = useState(today);
  const [selectedDay, setSelectedDay] = useState(null);

  // Read-only view - unlike the editable per-car calendar, navigating to
  // earlier months to check history is allowed (no canGoPrev restriction).
  const goToMonth = (offset) => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + offset, 1));
  };

  const carDayStates = useMemo(() => {
    return cars.map((car) => ({
      car,
      bookedRanges: bookedRangesForCar(bookingHistory, car.id),
      blockedSet: new Set(blockedDates[car.id] ?? []),
    }));
  }, [cars, bookingHistory, blockedDates]);

  const getStatesForDay = (day) => {
    return carDayStates.map(({ car, bookedRanges, blockedSet }) => ({
      car,
      state: getDayState(day, { today, bookedRanges, blockedSet }),
    }));
  };

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  const cells = buildMonthGrid(viewMonth);
  const selectedStates = selectedDay ? getStatesForDay(selectedDay) : [];

  return (
    <View style={styles.container}>
      <VendorHeader
        title="Fleet Calendar"
        subtitle="All cars at a glance"
        showBack={false}
        right={
          <TouchableOpacity style={styles.fleetButton} onPress={() => router.push('/vendor/fleet')} hitSlop={10}>
            <Ionicons name="car-outline" size={18} color={colors.white} />
            <Text style={styles.fleetButtonText}>Manage Fleet</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {cars.length === 0 ? (
          <View style={styles.centerState}>
            <Ionicons name="car-outline" size={40} color={colors.disabled} />
            <Text style={styles.emptyText}>List a car to see your fleet calendar.</Text>
          </View>
        ) : (
          <>
            <View style={styles.calendarCard}>
              <View style={styles.monthNav}>
                <TouchableOpacity onPress={() => goToMonth(-1)} hitSlop={10}>
                  <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
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

                  const states = getStatesForDay(day);
                  const isSunday = day.getDay() === 0;

                  return (
                    <TouchableOpacity key={day.toISOString()} style={styles.dayCell} onPress={() => setSelectedDay(day)}>
                      <View style={[styles.dayInner, isSunday && styles.dayInnerSunday]}>
                        <Text style={[styles.dayText, isSunday && styles.dayTextSunday]}>{day.getDate()}</Text>
                        {!isSunday && (
                          <View style={styles.dotsRow}>
                            {states.map(({ car, state }) => {
                              if (state === 'past') return null;
                              const dotColor =
                                state === 'available' ? colors.success :
                                state === 'blocked' ? colors.error :
                                colors.info;
                              return <View key={car.id} style={[styles.dot, { backgroundColor: dotColor }]} />;
                            })}
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
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
          </>
        )}
      </ScrollView>

      <Modal visible={!!selectedDay} transparent animationType="fade" onRequestClose={() => setSelectedDay(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSelectedDay(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>
              {selectedDay ? `${MONTH_NAMES[selectedDay.getMonth()]} ${selectedDay.getDate()}, ${selectedDay.getFullYear()}` : ''}
            </Text>
            {selectedDay?.getDay() === 0 ? (
              <Text style={styles.sheetClosed}>WopeCar is closed on Sundays - no rentals possible.</Text>
            ) : (
              selectedStates.map(({ car, state }) => (
                <TouchableOpacity
                  key={car.id}
                  style={styles.sheetRow}
                  onPress={() => {
                    setSelectedDay(null);
                    router.push(`/vendor/car/availability/${car.id}`);
                  }}
                >
                  <Text style={styles.sheetCarName}>{car.name}</Text>
                  <View style={styles.sheetRowRight}>
                    <Text style={[
                      styles.sheetState,
                      state === 'available' && { color: colors.success },
                      state === 'blocked' && { color: colors.error },
                      state === 'booked' && { color: colors.info },
                      state === 'past' && { color: colors.textSubtle },
                    ]}>
                      {STATE_LABEL[state]}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
                  </View>
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
      aspectRatio: 0.85,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayInner: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      width: '100%',
      height: '100%',
      borderRadius: 8,
    },
    dayInnerSunday: {
      backgroundColor: colors.errorBg,
    },
    dayText: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textPrimary,
    },
    dayTextSunday: {
      color: colors.error,
    },
    dotsRow: {
      flexDirection: 'row',
      gap: 3,
      minHeight: 6,
    },
    dot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
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
    fleetButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.teal,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    fleetButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 12,
      color: colors.white,
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
      maxWidth: 360,
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
    sheetClosed: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textMuted,
      lineHeight: 20,
      marginBottom: 8,
    },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    sheetRowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    sheetCarName: {
      fontFamily: FONTS.medium,
      fontSize: 14,
      color: colors.textPrimary,
    },
    sheetState: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
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
