import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';

const DRIVE_TYPES = [
  { value: 'Chauffeur', label: 'Chauffeur only' },
  { value: 'Self-drive', label: 'Self-drive or Chauffeur' },
];

const VEHICLE_CLASSES = [
  { value: 'luxury', label: 'Luxury' },
  { value: 'economy-1', label: 'Comfort' },
  { value: 'economy-2', label: 'Economy' },
];

const PRICE_RANGES = [
  { value: null, label: 'Any' },
  { value: '0;200', label: 'Under $200' },
  { value: '200;500', label: '$200 - $500' },
  { value: '500;1000', label: '$500 - $1,000' },
  { value: '1000;999999', label: '$1,000+' },
];

function toggleValue(list, value) {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

export default function FilterModal({
  visible,
  onClose,
  drivenBy,
  priceRange,
  vehicleClass,
  onApply,
}) {
  const [tempDrivenBy, setTempDrivenBy] = useState(drivenBy);
  const [tempPriceRange, setTempPriceRange] = useState(priceRange);
  const [tempVehicleClass, setTempVehicleClass] = useState(vehicleClass);

  useEffect(() => {
    if (visible) {
      setTempDrivenBy(drivenBy);
      setTempPriceRange(priceRange);
      setTempVehicleClass(vehicleClass);
    }
  }, [visible]);

  const handleClear = () => {
    setTempDrivenBy([]);
    setTempPriceRange(null);
    setTempVehicleClass([]);
  };

  const handleApply = () => {
    onApply({ drivenBy: tempDrivenBy, priceRange: tempPriceRange, vehicleClass: tempVehicleClass });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Filters</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={COLORS.navy} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
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
                    {isSelected && <Ionicons name="checkmark" size={14} color="#ffffff" />}
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
                    key={option.label}
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
                    {isSelected && <Ionicons name="checkmark" size={14} color="#ffffff" />}
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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
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
    color: COLORS.navy,
  },
  scroll: {
    flexGrow: 0,
  },
  sectionTitle: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    color: COLORS.navy,
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
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.teal,
    borderColor: COLORS.teal,
  },
  checkboxLabel: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.navy,
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
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  chipActive: {
    backgroundColor: COLORS.teal,
    borderColor: COLORS.teal,
  },
  chipText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: '#666',
  },
  chipTextActive: {
    fontFamily: FONTS.semiBold,
    color: '#ffffff',
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
    color: '#666',
  },
  applyButton: {
    backgroundColor: COLORS.orange,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 10,
  },
  applyButtonText: {
    fontFamily: FONTS.semiBold,
    color: '#ffffff',
    fontSize: 15,
  },
});
