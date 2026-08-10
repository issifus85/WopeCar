import { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { WEEKDAYS, MONTH_NAMES, stripTime, toISODate, buildMonthGrid } from '../services/vendorCalendar';

// Single-date variant of DateRangeModal.js's calendar - used for a document
// expiry date (e.g. Add Car's roadworthy/insurance certs), where a range
// doesn't make sense and there's no past-date restriction the way a rental
// or vetting-appointment date has (an expiry date is metadata about an
// already-issued document, not something being scheduled).
export default function SingleDateModal({ visible, onClose, title, value, onApply }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const today = stripTime(new Date());
  const initial = value ? stripTime(new Date(`${value}T00:00:00`)) : null;
  const [viewMonth, setViewMonth] = useState(initial ?? today);
  const [tempDate, setTempDate] = useState(initial);

  useEffect(() => {
    if (visible) {
      const next = value ? stripTime(new Date(`${value}T00:00:00`)) : null;
      setTempDate(next);
      setViewMonth(next ?? today);
    }
  }, [visible]);

  const goToMonth = (offset) => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + offset, 1));
  };

  const handleClear = () => setTempDate(null);

  const handleApply = () => {
    onApply(tempDate ? toISODate(tempDate) : null);
    onClose();
  };

  const cells = buildMonthGrid(viewMonth);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.monthNav}>
            <TouchableOpacity onPress={() => goToMonth(-1)} hitSlop={10}>
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
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
              const isSelected = tempDate && toISODate(day) === toISODate(tempDate);
              const isToday = toISODate(day) === toISODate(today);

              return (
                <TouchableOpacity
                  key={day.toISOString()}
                  style={styles.dayCell}
                  onPress={() => setTempDate(day)}
                >
                  <View style={[
                    styles.dayCircle,
                    isSelected && styles.dayCircleSelected,
                    isToday && !isSelected && styles.dayCircleToday,
                  ]}>
                    <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>
                      {day.getDate()}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity onPress={handleClear}>
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.applyButton, !tempDate && styles.applyButtonDisabled]}
              onPress={handleApply}
              disabled={!tempDate}
            >
              <Text style={styles.applyButtonText}>
                {tempDate ? `${MONTH_NAMES[tempDate.getMonth()].slice(0, 3)} ${tempDate.getDate()}, ${tempDate.getFullYear()}` : 'Select a date'}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: 30,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    headerTitle: {
      fontFamily: FONTS.bold,
      fontSize: 18,
      color: colors.textPrimary,
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
    dayTextSelected: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 20,
    },
    clearText: {
      fontFamily: FONTS.semiBold,
      fontSize: 15,
      color: colors.textMuted,
    },
    applyButton: {
      backgroundColor: colors.orange,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 10,
    },
    applyButtonDisabled: {
      backgroundColor: colors.disabled,
    },
    applyButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 15,
    },
  });
}
