import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ActivityIndicator, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { formatCurrency } from '../constants/pricing';
import { WEEKDAYS, MONTH_NAMES, stripTime, toISODate, buildMonthGrid } from '../services/vendorCalendar';
import { listDatePrices, upsertDatePrices, deleteDatePrices } from '../services/carPricingApi';

// Airbnb-style pricing calendar: tap dates to multi-select (even
// non-contiguous ones), then set one price across all of them at once. Any
// date left untouched keeps using the car's base per-day price - this
// component only manages the override rows in `car_date_prices`, it never
// touches `cars.price_per_day` itself.
export default function CarPricingCalendar({ carId, basePrice }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const today = stripTime(new Date());
  const [viewMonth, setViewMonth] = useState(today);
  const [priceMap, setPriceMap] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState(() => new Set());
  const [isPriceModalVisible, setIsPriceModalVisible] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await listDatePrices(carId);
      const map = {};
      rows.forEach((r) => { map[r.date] = Number(r.price); });
      setPriceMap(map);
    } catch (e) {
      setError(e.message || 'Could not load custom pricing.');
    }
  }, [carId]);

  useEffect(() => {
    setIsLoading(true);
    load().finally(() => setIsLoading(false));
  }, [load]);

  const goToMonth = (offset) => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + offset, 1));
  };
  const canGoPrev =
    viewMonth.getFullYear() > today.getFullYear() ||
    (viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() > today.getMonth());

  const toggleDay = (day) => {
    const iso = toISODate(day);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const openPriceModal = () => {
    // Pre-fill with the first selected date's existing custom price, if any,
    // so editing an already-priced date doesn't start from a blank field.
    const first = [...selected][0];
    setPriceInput(priceMap[first] != null ? String(priceMap[first]) : '');
    setIsPriceModalVisible(true);
  };

  const handleSavePrice = async () => {
    const price = Number(priceInput);
    if (!(price > 0)) return;
    setIsSaving(true);
    setError(null);
    try {
      await upsertDatePrices(carId, [...selected], price);
      await load();
      clearSelection();
      setIsPriceModalVisible(false);
    } catch (e) {
      setError(e.message || 'Could not save pricing.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearPrice = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await deleteDatePrices(carId, [...selected]);
      await load();
      clearSelection();
      setIsPriceModalVisible(false);
    } catch (e) {
      setError(e.message || 'Could not clear pricing.');
    } finally {
      setIsSaving(false);
    }
  };

  const cells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  return (
    <View>
      {!!error && <Text style={styles.errorText}>{error}</Text>}

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

            const iso = toISODate(day);
            const isPast = day < today;
            const isSelected = selected.has(iso);
            const customPrice = priceMap[iso];

            return (
              <TouchableOpacity
                key={iso}
                style={styles.dayCell}
                onPress={() => toggleDay(day)}
                disabled={isPast}
              >
                <View style={[
                  styles.dayInner,
                  !!customPrice && styles.dayInnerPriced,
                  isSelected && styles.dayInnerSelected,
                  isPast && styles.dayInnerPast,
                ]}>
                  <Text style={[
                    styles.dayText,
                    !!customPrice && styles.dayTextPriced,
                    isSelected && styles.dayTextSelected,
                    isPast && styles.dayTextPast,
                  ]}>
                    {day.getDate()}
                  </Text>
                  {!!customPrice && !isPast && (
                    <Text style={[styles.dayPrice, isSelected && styles.dayTextSelected]} numberOfLines={1}>
                      {formatCurrency(customPrice)}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: colors.highlight }]} />
            <Text style={styles.legendText}>Base price ({formatCurrency(basePrice)})</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: colors.teal }]} />
            <Text style={styles.legendText}>Custom price</Text>
          </View>
        </View>
      </View>

      {selected.size > 0 && (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionText}>{selected.size} date{selected.size === 1 ? '' : 's'} selected</Text>
          <View style={styles.selectionActions}>
            <TouchableOpacity style={styles.selectionCancelButton} onPress={clearSelection}>
              <Text style={styles.selectionCancelText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.selectionSetButton} onPress={openPriceModal}>
              <Text style={styles.selectionSetText}>Set Price</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Modal visible={isPriceModalVisible} transparent animationType="fade" onRequestClose={() => setIsPriceModalVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setIsPriceModalVisible(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>
              Set price for {selected.size} date{selected.size === 1 ? '' : 's'}
            </Text>
            <TextInput
              style={styles.priceInput}
              value={priceInput}
              onChangeText={setPriceInput}
              placeholder={`Price per day (GHS), e.g. ${basePrice}`}
              placeholderTextColor={colors.textSubtle}
              keyboardType="numeric"
              autoFocus
            />
            {[...selected].some((iso) => priceMap[iso] != null) && (
              <TouchableOpacity style={styles.clearPriceButton} onPress={handleClearPrice} disabled={isSaving}>
                <Text style={styles.clearPriceButtonText}>Remove custom price, use base rate instead</Text>
              </TouchableOpacity>
            )}
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.sheetCancelButton} onPress={() => setIsPriceModalVisible(false)}>
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetSaveButton, !(Number(priceInput) > 0) && styles.sheetSaveButtonDisabled]}
                onPress={handleSavePrice}
                disabled={isSaving || !(Number(priceInput) > 0)}
              >
                <Text style={styles.sheetSaveText}>{isSaving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    loadingWrap: {
      paddingVertical: 60,
      alignItems: 'center',
    },
    errorText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.error,
      textAlign: 'center',
      marginBottom: 12,
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
      aspectRatio: 0.85,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayInner: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
      width: '92%',
      height: '80%',
      borderRadius: 8,
      backgroundColor: colors.background,
    },
    dayInnerPriced: {
      backgroundColor: colors.highlight,
    },
    dayInnerSelected: {
      backgroundColor: colors.teal,
    },
    dayInnerPast: {
      opacity: 0.35,
    },
    dayText: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textPrimary,
    },
    dayTextPriced: {
      color: colors.textPrimary,
      fontFamily: FONTS.semiBold,
    },
    dayTextSelected: {
      color: colors.white,
    },
    dayTextPast: {
      color: colors.disabled,
    },
    dayPrice: {
      fontFamily: FONTS.medium,
      fontSize: 8.5,
      color: colors.textPrimary,
    },
    legendRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 16,
      marginTop: 14,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    legendSwatch: {
      width: 12,
      height: 12,
      borderRadius: 3,
    },
    legendText: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textMuted,
    },
    selectionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      marginTop: 14,
      shadowColor: colors.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 4,
    },
    selectionText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
    },
    selectionActions: {
      flexDirection: 'row',
      gap: 8,
    },
    selectionCancelButton: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    selectionCancelText: {
      fontFamily: FONTS.semiBold,
      fontSize: 12,
      color: colors.textMuted,
    },
    selectionSetButton: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 8,
      backgroundColor: colors.teal,
    },
    selectionSetText: {
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
      gap: 12,
    },
    sheetTitle: {
      fontFamily: FONTS.bold,
      fontSize: 16,
      color: colors.textPrimary,
    },
    priceInput: {
      backgroundColor: colors.background,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textPrimary,
    },
    clearPriceButton: {
      alignItems: 'center',
      paddingVertical: 4,
    },
    clearPriceButtonText: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.error,
      textDecorationLine: 'underline',
    },
    sheetActions: {
      flexDirection: 'row',
      gap: 10,
    },
    sheetCancelButton: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 13,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    sheetCancelText: {
      fontFamily: FONTS.semiBold,
      color: colors.textMuted,
      fontSize: 14,
    },
    sheetSaveButton: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 13,
      alignItems: 'center',
      backgroundColor: colors.teal,
    },
    sheetSaveButtonDisabled: {
      opacity: 0.5,
    },
    sheetSaveText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 14,
    },
  });
}
