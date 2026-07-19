import { StyleSheet, Text, View, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';

export const SORT_OPTIONS = [
  { value: 'special', label: 'Special' },
  { value: 'featured', label: 'Recommended' },
  { value: 'price_low_high', label: 'Price (Low to high)' },
  { value: 'price_high_low', label: 'Price (High to low)' },
  { value: 'rate_high_low', label: 'Rating (High to low)' },
];

export default function SortModal({ visible, onClose, value, onSelect }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Sort By</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={COLORS.navy} />
            </TouchableOpacity>
          </View>

          {SORT_OPTIONS.map((option) => {
            const isSelected = value === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={styles.optionRow}
                onPress={() => onSelect(option.value)}
              >
                <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                  {option.label}
                </Text>
                {isSelected && (
                  <Ionicons name="checkmark" size={20} color={COLORS.teal} />
                )}
              </TouchableOpacity>
            );
          })}
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.navy,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  optionText: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: COLORS.navy,
  },
  optionTextSelected: {
    fontFamily: FONTS.semiBold,
    color: COLORS.teal,
  },
});
