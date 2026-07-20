import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../constants/theme';
import { getMinBookingDays } from '../../constants/pricing';
import { fetchCarById, fetchCarAvailability } from '../../services/carsApi';
import { useCheckout } from '../../contexts/CheckoutContext';
import CheckoutHeader from '../../components/CheckoutHeader';
import CheckoutFooterButton from '../../components/CheckoutFooterButton';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(a, b) {
  return !!a && !!b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function buildMonthGrid(viewMonth) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstDay.getDay();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  return cells;
}

export default function CheckoutDatesScreen() {
  const { carId } = useLocalSearchParams();
  const router = useRouter();
  const { draft, updateDraft, startCheckout } = useCheckout();

  // Reached directly after a login redirect (cart.js only calls
  // startCheckout() on the already-logged-in path), so make sure the draft
  // is reset for this car rather than carrying over a stale one.
  useEffect(() => {
    if (draft.carId !== String(carId)) {
      startCheckout(carId);
    }
  }, [carId]);

  const [car, setCar] = useState(null);
  const [bookedRanges, setBookedRanges] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const today = stripTime(new Date());
  const [viewMonth, setViewMonth] = useState(today);
  const draftMatchesCar = draft.carId === String(carId);
  const [tempStart, setTempStart] = useState(draftMatchesCar && draft.startDate ? new Date(draft.startDate) : null);
  const [tempEnd, setTempEnd] = useState(draftMatchesCar && draft.endDate ? new Date(draft.endDate) : null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    Promise.all([
      fetchCarById(carId),
      // Availability is a "nice to have" for blocking out booked dates - if
      // it fails, still let the user pick dates rather than blocking checkout.
      fetchCarAvailability(carId).catch(() => []),
    ])
      .then(([carData, availability]) => {
        setCar(carData);
        setBookedRanges(availability);
      })
      .catch(() => setError('Could not load this car. Please try again.'))
      .finally(() => setIsLoading(false));
  }, [carId]);

  const isDayBooked = (day) => {
    return bookedRanges.some(range => day >= range.start && day <= range.end);
  };

  const handleDayPress = (day) => {
    if (day < today || isDayBooked(day) || day.getDay() === 0) return;
    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(day);
      setTempEnd(null);
    } else if (day < tempStart) {
      setTempStart(day);
      setTempEnd(null);
    } else {
      // Don't allow a range that jumps over a booked date.
      const spansBooked = bookedRanges.some(range =>
        range.start <= day && range.end >= tempStart
      );
      if (spansBooked) {
        setTempStart(day);
        setTempEnd(null);
        return;
      }
      setTempEnd(day);
    }
  };

  const canGoPrev =
    viewMonth.getFullYear() > today.getFullYear() ||
    (viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() > today.getMonth());

  const goToMonth = (offset) => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + offset, 1));
  };

  const handleContinue = () => {
    updateDraft({ startDate: tempStart.toISOString(), endDate: tempEnd.toISOString() });
    router.push({ pathname: '/checkout/details', params: { carId } });
  };

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={COLORS.teal} />
      </View>
    );
  }

  if (error || !car) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.errorText}>{error ?? 'Car not found'}</Text>
      </View>
    );
  }

  const cells = buildMonthGrid(viewMonth);
  const minDays = getMinBookingDays(car.drivenBy);
  const selectedDays = tempStart && tempEnd ? Math.round((tempEnd - tempStart) / (1000 * 60 * 60 * 24)) : 0;
  const isBelowMinimum = tempStart && tempEnd && selectedDays < minDays;

  return (
    <View style={styles.container}>
      <CheckoutHeader title="Select Dates" step={1} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.carName}>{car.name}</Text>
        <Text style={styles.carSubtitle}>Choose your pickup and return dates</Text>

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: COLORS.teal }]} />
            <Text style={styles.legendText}>Selected</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#FFCDD2' }]} />
            <Text style={styles.legendText}>Unavailable</Text>
          </View>
        </View>

        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => goToMonth(-1)} disabled={!canGoPrev} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={canGoPrev ? COLORS.navy : '#ccc'} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>
            {MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}
          </Text>
          <TouchableOpacity onPress={() => goToMonth(1)} hitSlop={10}>
            <Ionicons name="chevron-forward" size={22} color={COLORS.navy} />
          </TouchableOpacity>
        </View>

        <View style={styles.weekdayRow}>
          {WEEKDAYS.map((w) => (
            <Text key={w} style={styles.weekdayText}>{w}</Text>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((day, index) => {
            if (!day) return <View key={`empty-${index}`} style={styles.dayCell} />;

            const isPast = day < today;
            const isBooked = isDayBooked(day);
            const isSunday = day.getDay() === 0;
            const isDisabled = isPast || isBooked || isSunday;
            const isStart = isSameDay(day, tempStart);
            const isEnd = isSameDay(day, tempEnd);
            const isInRange = tempStart && tempEnd && day > tempStart && day < tempEnd;
            const isToday = isSameDay(day, today);

            return (
              <TouchableOpacity
                key={day.toISOString()}
                style={[styles.dayCell, isInRange && styles.dayCellInRange]}
                onPress={() => handleDayPress(day)}
                disabled={isDisabled}
              >
                <View style={[
                  styles.dayCircle,
                  isBooked && styles.dayCircleBooked,
                  (isStart || isEnd) && styles.dayCircleSelected,
                  isToday && !isStart && !isEnd && styles.dayCircleToday,
                ]}>
                  <Text style={[
                    styles.dayText,
                    (isPast || isSunday) && styles.dayTextPast,
                    isBooked && styles.dayTextBooked,
                    (isStart || isEnd) && styles.dayTextSelected,
                  ]}>
                    {day.getDate()}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {tempStart && tempEnd && (
          <View style={[styles.summaryBox, isBelowMinimum && styles.summaryBoxWarning]}>
            <Ionicons
              name={isBelowMinimum ? 'alert-circle-outline' : 'calendar-outline'}
              size={18}
              color={isBelowMinimum ? '#C62828' : COLORS.teal}
            />
            <Text style={[styles.summaryText, isBelowMinimum && styles.summaryTextWarning]}>
              {isBelowMinimum
                ? `${car.drivenBy} bookings need at least ${minDays} ${minDays === 1 ? 'day' : 'days'} - you've selected ${selectedDays}.`
                : `${selectedDays} day rental selected`}
            </Text>
          </View>
        )}
      </ScrollView>

      <CheckoutFooterButton
        label="Continue"
        onPress={handleContinue}
        disabled={!tempStart || !tempEnd || isBelowMinimum}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorText: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  carName: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.navy,
  },
  carSubtitle: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#888',
    marginTop: 2,
    marginBottom: 16,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
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
    color: '#666',
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
    color: COLORS.navy,
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
    color: '#999',
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
  dayCellInRange: {
    backgroundColor: '#EEF9F9',
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleBooked: {
    backgroundColor: '#FFCDD2',
  },
  dayCircleSelected: {
    backgroundColor: COLORS.teal,
  },
  dayCircleToday: {
    borderWidth: 1,
    borderColor: COLORS.teal,
  },
  dayText: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.navy,
  },
  dayTextPast: {
    color: '#ccc',
  },
  dayTextBooked: {
    color: '#C62828',
  },
  dayTextSelected: {
    fontFamily: FONTS.semiBold,
    color: '#ffffff',
  },
  summaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
  },
  summaryBoxWarning: {
    backgroundColor: '#FFEBEE',
  },
  summaryText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.navy,
  },
  summaryTextWarning: {
    color: '#C62828',
    flex: 1,
  },
});
