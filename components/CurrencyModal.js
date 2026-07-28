import { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

export default function CurrencyModal({ visible, onClose, currencies, value, onSelect }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Currency</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {currencies.map((currency) => {
            const isSelected = value === currency.code;
            return (
              <TouchableOpacity
                key={currency.code}
                style={styles.optionRow}
                onPress={() => onSelect(currency.code)}
              >
                <View style={styles.optionLeft}>
                  <Text style={styles.optionSymbol}>{currency.symbol}</Text>
                  <View>
                    <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                      {currency.name}
                    </Text>
                    <Text style={styles.optionCode}>{currency.code}</Text>
                  </View>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark" size={20} color={colors.teal} />
                )}
              </TouchableOpacity>
            );
          })}
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
      marginBottom: 12,
    },
    headerTitle: {
      fontFamily: FONTS.bold,
      fontSize: 18,
      color: colors.textPrimary,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    optionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    optionSymbol: {
      width: 28,
      textAlign: 'center',
      fontFamily: FONTS.semiBold,
      fontSize: 16,
      color: colors.teal,
    },
    optionText: {
      fontFamily: FONTS.regular,
      fontSize: 15,
      color: colors.textPrimary,
    },
    optionTextSelected: {
      fontFamily: FONTS.semiBold,
      color: colors.teal,
    },
    optionCode: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
      marginTop: 1,
    },
  });
}
