import { useState, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, ScrollView, Animated } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { getMinBookingDays } from '../../constants/pricing';
import { fetchCarById, fetchCarAvailability } from '../../services/carsApi';
import { isSundayBlockedForCar } from '../../services/vendorCalendar';
import { useCheckout } from '../../contexts/CheckoutContext';
import CheckoutHeader from '../../components/CheckoutHeader';
import CheckoutFooterButton from '../../components/CheckoutFooterButton';
import ConfirmModal from '../../components/ConfirmModal';
import { logScreen, logStartCheckout } from '../../services/analytics';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// e.g. "Mon 17 Aug" - used by the 24hr rental note below, distinct from
// the calendar grid's 2-letter WEEKDAYS and the month-nav's full MONTH_NAMES.
function formatShortDate(date) {
  return `${SHORT_WEEKDAYS[date.getDay()]} ${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`;
}

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

/**
 * Explains the 24hr rental cycle (self-drive only - chauffeur bookings are
 * calculated per day, not per 24hr, so callers gate this out for those).
 * Mounts fresh each time the calendar goes from a partial to a full date
 * range (the parent's `{tempStart && tempEnd && <RentalHoursNote .../>}`
 * conditional unmounts it otherwise), so a plain mount-time fade-in via
 * Animated.timing covers "animate in when dates are selected" without
 * needing to track selection state changes itself.
 */
function RentalHoursNote({ days, startDate, returnDate, styles, colors }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, []);

  const dayWord = days === 1 ? 'day' : 'days';

  return (
    <Animated.View style={[styles.hoursNoteCard, { opacity }]}>
      <Ionicons name="information-circle-outline" size={20} color={colors.teal} style={styles.hoursNoteIcon} />
      <View style={styles.hoursNoteTextWrap}>
        <Text style={styles.hoursNoteTitle}>How your rental days work</Text>
        <Text style={styles.hoursNoteBody}>
          {`You've selected ${days} ${dayWord}. With a 24-hour rental, if you pick up at 8:00 AM on ${formatShortDate(startDate)}, your car must be returned by 8:00 AM on ${formatShortDate(returnDate)} to use your full ${days} ${dayWord}.`}
        </Text>
        <Text style={styles.hoursNoteBody}>You&apos;ll set your exact pickup time on the next screen.</Text>
        <Text style={styles.hoursNoteFootnote}>Returning late may incur additional charges.</Text>
      </View>
    </Animated.View>
  );
}

/**
 * Chauffeur-only cars have Sundays open (unlike self-drive/mixed, which stay
 * blocked every Sunday - see isSundayBlockedForCar), but a Sunday pickup
 * still needs 24h notice, so this explains that the moment a Sunday is
 * chosen as pickup, before the return date is even picked - same mount-time
 * fade-in as RentalHoursNote, for the same reason (the parent's
 * conditional remounts it fresh each time it becomes eligible to show).
 */
function SundayChauffeurNote({ styles, colors }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={[styles.hoursNoteCard, { opacity }]}>
      <Ionicons name="information-circle-outline" size={20} color={colors.teal} style={styles.hoursNoteIcon} />
      <View style={styles.hoursNoteTextWrap}>
        <Text style={styles.sundayNoteText}>Sunday bookings require at least 24 hours notice.</Text>
        <Text style={styles.sundayNoteText}>Same-day Sunday pickups are not available.</Text>
      </View>
    </Animated.View>
  );
}

export default function CheckoutDatesScreen() {
  const { carId } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { draft, updateDraft, startCheckout } = useCheckout();

  // Reached directly after a login redirect (cart.js only calls
  // startCheckout() on the already-logged-in path), so make sure the draft
  // is reset for this car rather than carrying over a stale one.
  useEffect(() => {
    if (draft.carId !== String(carId)) {
      startCheckout(carId);
    }
  }, [carId]);

  useEffect(() => {
    logScreen('Checkout_Dates');
  }, []);

  const [car, setCar] = useState(null);
  const [bookedRanges, setBookedRanges] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSundayNotice, setShowSundayNotice] = useState(false);

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
    if (day < today || isDayBooked(day) || isSundayBlockedForCar(day, car, today)) return;
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
    // Defense-in-depth against handleDayPress's own guard: the calendar
    // grid can't let someone tap an already-blocked Sunday, but a Sunday
    // picked as "tomorrow" stays selected if the app is left open across
    // midnight - reusing isSundayBlockedForCar with a fresh `new Date()`
    // (not the mount-time `today`) catches that instead of letting a
    // same-day Sunday chauffeur booking silently through.
    if (isSundayBlockedForCar(tempStart, car, new Date())) {
      setShowSundayNotice(true);
      return;
    }
    updateDraft({ startDate: tempStart.toISOString(), endDate: tempEnd.toISOString() });
    // Rough default-rate estimate, not the final priced total - add-ons,
    // WopeCare, and discounts aren't chosen yet at this first checkout step.
    logStartCheckout({
      carId,
      carName: car.name,
      totalDays: selectedDays,
      estimatedCost: car.pricePerDay * selectedDays,
    });
    router.push({ pathname: '/checkout/details', params: { carId } });
  };

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
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
  // Inclusive day count so picking the same day for pickup and return reads
  // as a 1-day booking (matching calculateRentalPricing's billing cycles)
  // rather than 0 - which used to silently fail the minimum-days check and
  // force a same-day chauffeur rental into an unwanted 2nd billable day.
  const selectedDays = tempStart && tempEnd
    ? Math.round((tempEnd - tempStart) / (1000 * 60 * 60 * 24)) + 1
    : 0;
  const isBelowMinimum = tempStart && tempEnd && selectedDays < minDays;
  // Return date = end date + 1 day - a 24hr rental returns the morning
  // AFTER the last rental day, not on the last day itself.
  const returnDate = tempEnd ? new Date(tempEnd) : null;
  if (returnDate) returnDate.setDate(returnDate.getDate() + 1);
  const showHoursNote = tempStart && tempEnd && car.drivenBy !== 'Chauffeur';
  const showSundayChauffeurNote = car.drivenBy === 'Chauffeur' && tempStart?.getDay() === 0;

  return (
    <View style={styles.container}>
      <CheckoutHeader title="Select Dates" step={1} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.carName}>{car.name}</Text>
        <Text style={styles.carSubtitle}>Choose your pickup and return dates</Text>

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.teal }]} />
            <Text style={styles.legendText}>Selected</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#FFCDD2' }]} />
            <Text style={styles.legendText}>Unavailable</Text>
          </View>
        </View>

        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => goToMonth(-1)} disabled={!canGoPrev} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={canGoPrev ? colors.textPrimary : colors.disabled} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>
            {MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}
          </Text>
          <TouchableOpacity onPress={() => goToMonth(1)} hitSlop={10}>
            <Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />
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
            const isSunday = isSundayBlockedForCar(day, car, today);
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
              color={isBelowMinimum ? colors.error : colors.teal}
            />
            <Text style={[styles.summaryText, isBelowMinimum && styles.summaryTextWarning]}>
              {isBelowMinimum
                ? `${car.drivenBy} bookings need at least ${minDays} ${minDays === 1 ? 'day' : 'days'} - you've selected ${selectedDays}.`
                : `${selectedDays} day rental selected`}
            </Text>
          </View>
        )}

        {showHoursNote && (
          <RentalHoursNote days={selectedDays} startDate={tempStart} returnDate={returnDate} styles={styles} colors={colors} />
        )}

        {showSundayChauffeurNote && (
          <SundayChauffeurNote styles={styles} colors={colors} />
        )}
      </ScrollView>

      <CheckoutFooterButton
        label="Continue"
        onPress={handleContinue}
        disabled={!tempStart || !tempEnd || isBelowMinimum}
      />

      <ConfirmModal
        visible={showSundayNotice}
        title="Sunday Booking Notice"
        message={'Sunday chauffeur bookings require at least 24 hours advance notice.\n\nPlease select a different pickup date or book for a future Sunday.'}
        confirmLabel="OK — Change Dates"
        cancelLabel={null}
        onConfirm={() => setShowSundayNotice(false)}
        onCancel={() => setShowSundayNotice(false)}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
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
    color: colors.textMuted,
    textAlign: 'center',
  },
  carName: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  carSubtitle: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: colors.textSubtle,
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
    color: colors.textMuted,
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
  dayCellInRange: {
    backgroundColor: colors.highlight,
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
    backgroundColor: colors.teal,
  },
  dayCircleToday: {
    borderWidth: 1,
    borderColor: colors.teal,
  },
  dayText: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  dayTextPast: {
    color: colors.disabled,
  },
  dayTextBooked: {
    color: '#C62828',
  },
  dayTextSelected: {
    fontFamily: FONTS.semiBold,
    color: colors.white,
  },
  summaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
    // Tight on purpose - the calendar grid's own trailing empty cells in a
    // partially-filled last week already read as a gap on their own, so
    // this box needs to sit close behind the grid rather than adding more
    // space on top of it.
    marginTop: 6,
  },
  summaryBoxWarning: {
    backgroundColor: colors.errorBg,
  },
  summaryText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  summaryTextWarning: {
    color: colors.error,
    flex: 1,
  },
  hoursNoteCard: {
    flexDirection: 'row',
    backgroundColor: colors.highlight,
    borderLeftWidth: 3,
    borderLeftColor: colors.teal,
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
  },
  hoursNoteIcon: {
    marginRight: 10,
    marginTop: 1,
  },
  hoursNoteTextWrap: {
    flex: 1,
  },
  hoursNoteTitle: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  hoursNoteBody: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textBody,
    marginBottom: 8,
  },
  hoursNoteFootnote: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 0,
  },
  sundayNoteText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    marginBottom: 2,
  },
  });
}
