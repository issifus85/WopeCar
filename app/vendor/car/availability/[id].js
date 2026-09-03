import { useMemo, useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../../constants/theme';
import { useAppTheme } from '../../../../contexts/ThemeContext';
import { useVendor } from '../../../../contexts/VendorContext';
import VendorHeader from '../../../../components/VendorHeader';
import CheckoutFooterButton from '../../../../components/CheckoutFooterButton';
import ConfirmModal from '../../../../components/ConfirmModal';
import {
  WEEKDAYS, MONTH_NAMES, stripTime, toISODate, addDays, buildMonthGrid, getDayState, bookedRangesForCar,
} from '../../../../services/vendorCalendar';

const ADVANCE_NOTICE_OPTIONS = [
  { label: 'Same day', value: 0 },
  { label: '1 day', value: 1 },
  { label: '2 days', value: 2 },
  { label: '3 days', value: 3 },
];
const BOOKING_WINDOW_OPTIONS = [
  { label: '3 months', value: 3 },
  { label: '6 months', value: 6 },
  { label: '1 year', value: 12 },
];
const MIN_BOOKING_OPTIONS = [
  { label: '1 day', value: 1 },
  { label: '3 days', value: 3 },
  { label: '7 days', value: 7 },
];

function OptionPills({ options, value, onChange, styles }) {
  return (
    <View style={styles.pillsRow}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.pill, active && styles.pillActive]}
            onPress={() => onChange(opt.value)}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function VendorAvailabilityScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    cars, bookingHistory, blockedDates, isLoading,
    getAvailabilitySettings, setBlockedDates, setAvailabilitySettings,
  } = useVendor();

  const car = cars.find((c) => c.id === id);
  const today = stripTime(new Date());

  const [viewMonth, setViewMonth] = useState(today);
  const [mode, setMode] = useState('single'); // 'single' | 'range'
  const [rangeStart, setRangeStart] = useState(null);
  const [localSettings, setLocalSettings] = useState(null);
  const [showSaved, setShowSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (car) setLocalSettings(getAvailabilitySettings(car.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [car?.id]);

  const bookedRanges = useMemo(() => {
    if (!car) return [];
    return bookedRangesForCar(bookingHistory, car.id);
  }, [bookingHistory, car]);

  const blockedSet = useMemo(() => new Set((car && blockedDates[car.id]) ?? []), [blockedDates, car]);

  if (isLoading || !localSettings) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  if (!car) {
    return (
      <View style={styles.container}>
        <VendorHeader title="Manage Availability" onBack={() => router.replace('/vendor/fleet')} />
        <View style={styles.centerState}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.disabled} />
          <Text style={styles.emptyText}>This car couldn't be found.</Text>
        </View>
      </View>
    );
  }

  const goToMonth = (offset) => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + offset, 1));
    setRangeStart(null);
  };
  const canGoPrev =
    viewMonth.getFullYear() > today.getFullYear() ||
    (viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() > today.getMonth());

  const handleDayPress = (day) => {
    const state = getDayState(day, { today, bookedRanges, blockedSet, car });
    if (state === 'past' || state === 'sunday' || state === 'booked') return;

    if (mode === 'single') {
      const iso = toISODate(day);
      const current = blockedDates[car.id] ?? [];
      const next = state === 'blocked' ? current.filter((d) => d !== iso) : [...current, iso];
      setBlockedDates(car.id, next).catch(() => Alert.alert('Could not update', 'Please check your connection and try again.'));
      return;
    }

    // Range mode: first tap sets the start; a second tap on/after it commits
    // the whole [start, end] range as blocked (skipping any day that's
    // past/Sunday/already booked, which stay exactly as they were).
    if (!rangeStart) {
      setRangeStart(day);
      return;
    }
    if (day < rangeStart) {
      setRangeStart(day);
      return;
    }
    const nextSet = new Set(blockedDates[car.id] ?? []);
    let cursor = rangeStart;
    while (cursor <= day) {
      const cursorState = getDayState(cursor, { today, bookedRanges, blockedSet, car });
      if (cursorState !== 'past' && cursorState !== 'sunday' && cursorState !== 'booked') {
        nextSet.add(toISODate(cursor));
      }
      cursor = addDays(cursor, 1);
    }
    setBlockedDates(car.id, Array.from(nextSet)).catch(() => Alert.alert('Could not update', 'Please check your connection and try again.'));
    setRangeStart(null);
  };

  const savedSettings = getAvailabilitySettings(car.id);
  const isDirty =
    savedSettings.advanceNoticeDays !== localSettings.advanceNoticeDays ||
    savedSettings.bookingWindowMonths !== localSettings.bookingWindowMonths ||
    savedSettings.minBookingDays !== localSettings.minBookingDays;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await setAvailabilitySettings(car.id, localSettings);
      setShowSaved(true);
    } catch (e) {
      Alert.alert('Could not save settings', e?.message || 'Please check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const cells = buildMonthGrid(viewMonth);

  return (
    <View style={styles.container}>
      <VendorHeader title={car.name} subtitle="Manage Availability" onBack={() => router.replace(`/vendor/car/${car.id}`)} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'single' && styles.modeButtonActive]}
            onPress={() => { setMode('single'); setRangeStart(null); }}
          >
            <Text style={[styles.modeButtonText, mode === 'single' && styles.modeButtonTextActive]}>Tap to Toggle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'range' && styles.modeButtonActive]}
            onPress={() => { setMode('range'); setRangeStart(null); }}
          >
            <Text style={[styles.modeButtonText, mode === 'range' && styles.modeButtonTextActive]}>Block a Range</Text>
          </TouchableOpacity>
        </View>
        {mode === 'range' && (
          <Text style={styles.rangeHint}>
            {rangeStart
              ? `Start: ${MONTH_NAMES[rangeStart.getMonth()].slice(0, 3)} ${rangeStart.getDate()} - tap an end date to block the range`
              : 'Tap a start date, then an end date, to block the whole range'}
          </Text>
        )}

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

              const state = getDayState(day, { today, bookedRanges, blockedSet, car });
              const isDisabled = state === 'past' || state === 'sunday' || state === 'booked';
              const isRangeStart = mode === 'range' && rangeStart && day.getTime() === rangeStart.getTime();

              return (
                <TouchableOpacity
                  key={day.toISOString()}
                  style={styles.dayCell}
                  onPress={() => handleDayPress(day)}
                  disabled={isDisabled}
                >
                  <View style={[
                    styles.dayCircle,
                    state === 'available' && styles.dayCircleAvailable,
                    state === 'blocked' && styles.dayCircleBlocked,
                    (state === 'sunday') && styles.dayCircleBlocked,
                    state === 'booked' && styles.dayCircleBooked,
                    state === 'past' && styles.dayCirclePast,
                    isRangeStart && styles.dayCircleRangeStart,
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

        <Text style={styles.sectionTitle}>Availability Settings</Text>
        <View style={styles.settingsCard}>
          <Text style={styles.settingLabel}>Advance notice required</Text>
          <OptionPills
            options={ADVANCE_NOTICE_OPTIONS}
            value={localSettings.advanceNoticeDays}
            onChange={(value) => setLocalSettings((prev) => ({ ...prev, advanceNoticeDays: value }))}
            styles={styles}
          />

          <Text style={[styles.settingLabel, styles.settingLabelSpaced]}>Booking window</Text>
          <OptionPills
            options={BOOKING_WINDOW_OPTIONS}
            value={localSettings.bookingWindowMonths}
            onChange={(value) => setLocalSettings((prev) => ({ ...prev, bookingWindowMonths: value }))}
            styles={styles}
          />

          <Text style={[styles.settingLabel, styles.settingLabelSpaced]}>Minimum booking length</Text>
          <OptionPills
            options={MIN_BOOKING_OPTIONS}
            value={localSettings.minBookingDays}
            onChange={(value) => setLocalSettings((prev) => ({ ...prev, minBookingDays: value }))}
            styles={styles}
          />
        </View>
      </ScrollView>

      <CheckoutFooterButton label={isSaving ? 'Saving...' : 'Save Settings'} onPress={handleSave} disabled={!isDirty || isSaving} />

      <ConfirmModal
        visible={showSaved}
        title="Saved"
        message="Your availability settings have been updated."
        confirmLabel="OK"
        cancelLabel={null}
        onConfirm={() => setShowSaved(false)}
        onCancel={() => setShowSaved(false)}
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
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    modeRow: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 4,
      marginBottom: 12,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    modeButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 9,
      alignItems: 'center',
    },
    modeButtonActive: {
      backgroundColor: colors.teal,
    },
    modeButtonText: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.textSubtle,
    },
    modeButtonTextActive: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
    },
    rangeHint: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginBottom: 12,
      textAlign: 'center',
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
    dayCircleRangeStart: {
      borderWidth: 2,
      borderColor: colors.teal,
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
      marginBottom: 24,
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
    sectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: 12,
    },
    settingsCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    settingLabel: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
      marginBottom: 8,
    },
    settingLabelSpaced: {
      marginTop: 18,
    },
    pillsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    pill: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    pillActive: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    pillText: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.textMuted,
    },
    pillTextActive: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
    },
  });
}
