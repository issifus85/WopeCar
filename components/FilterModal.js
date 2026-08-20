import { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { formatCurrency } from '../constants/pricing';
import { VEHICLE_CLASSES, VEHICLE_TYPES } from '../constants/vehicleCatalog';

const DRIVE_TYPES = [
  { value: 'Chauffeur', label: 'Chauffeur only' },
  { value: 'Self-drive', label: 'Self-drive or Chauffeur' },
];

// The `value` thresholds are always raw GHS - they're sent straight
// through to fetchCars() as minPrice/maxPrice against cars.price_per_day
// (stored in GHS, see app/(tabs)/index.js), so they must never be
// converted. Only the displayed label goes through formatCurrency() with
// whatever currency is active.
//
// Breakpoints (1000/1500/2500) chosen from the real fleet's price
// distribution, not guessed: as of 2026-08-20, 68 active cars ranged
// GHS 650-18,000 (median ~1,225) with roughly even clusters of
// 18/28/17/5 cars across these 4 buckets. The old $200/$500/$1,000
// breakpoints were all below the cheapest car in the fleet (GHS 650),
// so "Under $200" through "$500-$1,000" were permanently-empty filters.
function getPriceRanges(currency) {
  return [
    { value: null, label: 'Any' },
    { value: '0;1000', label: `Under ${formatCurrency(1000, currency)}` },
    { value: '1000;1500', label: `${formatCurrency(1000, currency)} - ${formatCurrency(1500, currency)}` },
    { value: '1500;2500', label: `${formatCurrency(1500, currency)} - ${formatCurrency(2500, currency)}` },
    { value: '2500;999999', label: `${formatCurrency(2500, currency)}+` },
  ];
}

function toggleValue(list, value) {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

export default function FilterModal({
  visible,
  onClose,
  drivenBy,
  priceRange,
  vehicleClass,
  type,
  onApply,
}) {
  const { colors } = useAppTheme();
  const { activeCurrency } = useCurrency();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const PRICE_RANGES = useMemo(() => getPriceRanges(activeCurrency), [activeCurrency]);
  const [tempDrivenBy, setTempDrivenBy] = useState(drivenBy);
  const [tempPriceRange, setTempPriceRange] = useState(priceRange);
  const [tempVehicleClass, setTempVehicleClass] = useState(vehicleClass);
  const [tempType, setTempType] = useState(type);

  useEffect(() => {
    if (visible) {
      setTempDrivenBy(drivenBy);
      setTempPriceRange(priceRange);
      setTempVehicleClass(vehicleClass);
      setTempType(type);
    }
  }, [visible]);

  const handleClear = () => {
    setTempDrivenBy([]);
    setTempPriceRange(null);
    setTempVehicleClass([]);
    setTempType([]);
  };

  const handleApply = () => {
    onApply({ drivenBy: tempDrivenBy, priceRange: tempPriceRange, vehicleClass: tempVehicleClass, type: tempType });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Filters</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
            <Text style={styles.sectionTitle}>Category</Text>
            {VEHICLE_TYPES.map((option) => {
              const isSelected = tempType.includes(option.value);
              return (
                <TouchableOpacity
                  key={option.value}
                  style={styles.checkboxRow}
                  onPress={() => setTempType(toggleValue(tempType, option.value))}
                >
                  <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                    {isSelected && <Ionicons name="checkmark" size={14} color={colors.white} />}
                  </View>
                  <Text style={styles.checkboxLabel}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}

            <Text style={styles.sectionTitle}>Drive Type</Text>
            {DRIVE_TYPES.map((option) => {
              const isSelected = tempDrivenBy.includes(option.value);
              return (
                <TouchableOpacity
                  key={option.value}
                  style={styles.checkboxRow}
                  onPress={() => setTempDrivenBy(toggleValue(tempDrivenBy, option.value))}
                >
                  <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                    {isSelected && <Ionicons name="checkmark" size={14} color={colors.white} />}
                  </View>
                  <Text style={styles.checkboxLabel}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}

            <Text style={styles.sectionTitle}>Price Range</Text>
            <View style={styles.chipRow}>
              {PRICE_RANGES.map((option) => {
                const isSelected = tempPriceRange === option.value;
                return (
                  <TouchableOpacity
                    key={String(option.value)}
                    style={[styles.chip, isSelected && styles.chipActive]}
                    onPress={() => setTempPriceRange(option.value)}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Vehicle Class</Text>
            {VEHICLE_CLASSES.map((option) => {
              const isSelected = tempVehicleClass.includes(option.value);
              return (
                <TouchableOpacity
                  key={option.value}
                  style={styles.checkboxRow}
                  onPress={() => setTempVehicleClass(toggleValue(tempVehicleClass, option.value))}
                >
                  <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                    {isSelected && <Ionicons name="checkmark" size={14} color={colors.white} />}
                  </View>
                  <Text style={styles.checkboxLabel}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity onPress={handleClear}>
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
              <Text style={styles.applyButtonText}>Apply Filters</Text>
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
      maxHeight: '80%',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    headerTitle: {
      fontFamily: FONTS.bold,
      fontSize: 18,
      color: colors.textPrimary,
    },
    scroll: {
      flexGrow: 0,
    },
    sectionTitle: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
      marginTop: 18,
      marginBottom: 10,
    },
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      gap: 12,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: colors.disabled,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    checkboxLabel: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textPrimary,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 20,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    chipText: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textMuted,
    },
    chipTextActive: {
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
    applyButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 15,
    },
  });
}
