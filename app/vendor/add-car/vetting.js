import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useAddCar } from '../../../contexts/AddCarContext';
import { WEEKDAYS, MONTH_NAMES, stripTime, toISODate, buildMonthGrid } from '../../../services/vendorCalendar';
import VendorWizardHeader from '../../../components/VendorWizardHeader';
import CheckoutFooterButton from '../../../components/CheckoutFooterButton';

const TIME_SLOTS = [
  '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM',
];

export default function AddCarVettingScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { draft, updateDraft } = useAddCar();

  const today = useMemo(() => stripTime(new Date()), []);
  const [viewMonth, setViewMonth] = useState(today);
  const cells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  const isValid = !!draft.vettingDate && !!draft.vettingTime;

  const goToMonth = (offset) => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + offset, 1));
  };

  const canGoPrev =
    viewMonth.getFullYear() > today.getFullYear() ||
    (viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() > today.getMonth());

  const handleDayPress = (day) => {
    if (day < today || day.getDay() === 0) return;
    updateDraft({ vettingDate: toISODate(day) });
  };

  const handleContinue = () => {
    router.push('/vendor/add-car/review');
  };

  return (
    <View style={styles.container}>
      <VendorWizardHeader title="Schedule Photos & Vetting" step={5} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.infoBox}>
          <Ionicons name="camera-outline" size={18} color={colors.teal} />
          <Text style={styles.infoText}>
            Before your car can go live, schedule a visit to the WopeCar office for verification photos and a
            vetting check. Pick a date and time that works for you.
          </Text>
        </View>

        <Text style={styles.label}>Date</Text>
        <View style={styles.calendarCard}>
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

              const iso = toISODate(day);
              const isPast = day < today;
              const isSunday = day.getDay() === 0;
              const isDisabled = isPast || isSunday;
              const isSelected = draft.vettingDate === iso;
              const isToday = iso === toISODate(today);

              return (
                <TouchableOpacity
                  key={iso}
                  style={styles.dayCell}
                  onPress={() => handleDayPress(day)}
                  disabled={isDisabled}
                >
                  <View style={[
                    styles.dayCircle,
                    isSelected && styles.dayCircleSelected,
                    isToday && !isSelected && styles.dayCircleToday,
                  ]}>
                    <Text style={[
                      styles.dayText,
                      isDisabled && styles.dayTextDisabled,
                      isSelected && styles.dayTextSelected,
                    ]}>
                      {day.getDate()}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Text style={[styles.label, styles.labelSpaced]}>Time</Text>
        <View style={styles.slotGrid}>
          {TIME_SLOTS.map((slot) => {
            const active = draft.vettingTime === slot;
            return (
              <TouchableOpacity
                key={slot}
                style={[styles.slot, active && styles.slotActive]}
                onPress={() => updateDraft({ vettingTime: slot })}
              >
                <Text style={[styles.slotText, active && styles.slotTextActive]}>{slot}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <CheckoutFooterButton label="Continue" onPress={handleContinue} disabled={!isValid} />
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    infoBox: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: colors.highlight,
      borderRadius: 12,
      padding: 14,
      marginBottom: 20,
    },
    infoText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 18,
    },
    label: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
      marginBottom: 10,
    },
    labelSpaced: {
      marginTop: 20,
    },
    calendarCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
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
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
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
    dayTextDisabled: {
      color: colors.disabled,
    },
    dayTextSelected: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
    },
    slotGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    slot: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    slotActive: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    slotText: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.textMuted,
    },
    slotTextActive: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
    },
  });
}
