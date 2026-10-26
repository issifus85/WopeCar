import { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

// Which unit the odometer reads in: some cars show kilometres, others miles. A check mark on exactly one of the two sits next to the
// reading so the inspection records the unit the inspector actually saw. 'km' is the default and one is always checked.
const UNITS = [
  { key: 'km', label: 'km' },
  { key: 'mi', label: 'miles' },
];

export default function MileageUnitCheck({ value, onChange }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {UNITS.map((u) => {
        const checked = (value || 'km') === u.key;
        return (
          <TouchableOpacity
            key={u.key}
            style={styles.option}
            onPress={() => onChange(u.key)}
            hitSlop={6}
            accessibilityRole="radio"
            accessibilityState={{ checked }}
            accessibilityLabel={u.label}
          >
            <View style={[styles.box, checked && styles.boxChecked]}>
              {checked && <Ionicons name="checkmark" size={14} color={colors.white} />}
            </View>
            <Text style={[styles.text, checked && styles.textChecked]}>{u.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 12 },
    option: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    box: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxChecked: { backgroundColor: colors.teal, borderColor: colors.teal },
    text: { fontFamily: FONTS.regular, fontSize: 14, color: colors.textSubtle },
    textChecked: { fontFamily: FONTS.semiBold, color: colors.textPrimary },
  });
}
