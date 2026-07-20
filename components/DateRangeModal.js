import { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function isSameDay(a, b) {
  return !!a && !!b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function buildMonthGrid(viewMonth) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstDay.getDay();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(year, month, day));
  }
  return cells;
}

export function formatDateShort(date) {
  if (!date) return null;
  return `${MONTH_NAMES[date.getMonth()].slice(0, 3)} ${date.getDate()}`;
}

export default function DateRangeModal({ visible, onClose, startDate, endDate, onApply }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const today = stripTime(new Date());
  const [viewMonth, setViewMonth] = useState(startDate ? stripTime(startDate) : today);
  const [tempStart, setTempStart] = useState(startDate ?? null);
  const [tempEnd, setTempEnd] = useState(endDate ?? null);

  useEffect(() => {
    if (visible) {
      setTempStart(startDate ?? null);
      setTempEnd(endDate ?? null);
      setViewMonth(startDate ? stripTime(startDate) : today);
    }
  }, [visible]);

  const goToMonth = (offset) => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + offset, 1));
  };

  const canGoPrev =
    viewMonth.getFullYear() > today.getFullYear() ||
    (viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() > today.getMonth());

  const handleDayPress = (day) => {
    if (day < today || day.getDay() === 0) return;
    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(day);
      setTempEnd(null);
    } else if (day < tempStart) {
      setTempStart(day);
      setTempEnd(null);
    } else {
      setTempEnd(day);
    }
  };

  const handleClear = () => {
    setTempStart(null);
    setTempEnd(null);
  };

  const handleApply = () => {
    if (tempStart && tempEnd) {
      onApply(tempStart, tempEnd);
      onClose();
    }
  };

  const cells = buildMonthGrid(viewMonth);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Select Dates</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.monthNav}>
            <TouchableOpacity
              onPress={() => goToMonth(-1)}
              disabled={!canGoPrev}
              hitSlop={10}
            >
              <Ionicons
                name="chevron-back"
                size={22}
                color={canGoPrev ? colors.textPrimary : colors.disabled}
              />
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
              if (!day) {
                return <View key={`empty-${index}`} style={styles.dayCell} />;
              }
              const isPast = day < today;
              const isSunday = day.getDay() === 0;
              const isDisabled = isPast || isSunday;
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
                    (isStart || isEnd) && styles.dayCircleSelected,
                    isToday && !isStart && !isEnd && styles.dayCircleToday,
                  ]}>
                    <Text style={[
                      styles.dayText,
                      isDisabled && styles.dayTextPast,
                      (isStart || isEnd) && styles.dayTextSelected,
                    ]}>
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
              style={[styles.applyButton, !(tempStart && tempEnd) && styles.applyButtonDisabled]}
              onPress={handleApply}
              disabled={!(tempStart && tempEnd)}
            >
              <Text style={styles.applyButtonText}>
                {tempStart && tempEnd
                  ? `${formatDateShort(tempStart)} - ${formatDateShort(tempEnd)}`
                  : 'Check Availability'}
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
