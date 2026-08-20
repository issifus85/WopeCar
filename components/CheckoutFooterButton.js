import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

// secondaryLabel/onSecondaryPress/secondaryVisible are optional - only
// checkout/payment.js's "Save & Pay Later" uses them today. Every other
// checkout screen just omits them and gets the original single-button
// footer, unchanged.
export default function CheckoutFooterButton({ label, onPress, disabled, secondaryLabel, onSecondaryPress, secondaryVisible }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.footer}>
      <TouchableOpacity
        style={[styles.button, disabled && styles.buttonDisabled]}
        onPress={onPress}
        disabled={disabled}
      >
        <Text style={styles.buttonText}>{label}</Text>
      </TouchableOpacity>
      {secondaryVisible && !!secondaryLabel && (
        <TouchableOpacity style={styles.secondaryButton} onPress={onSecondaryPress}>
          <Text style={styles.secondaryButtonText}>{secondaryLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    footer: {
      padding: 20,
      paddingBottom: 28,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 10,
      elevation: 6,
    },
    button: {
      backgroundColor: colors.teal,
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: 'center',
    },
    buttonDisabled: {
      backgroundColor: colors.disabled,
    },
    buttonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 16,
    },
    secondaryButton: {
      marginTop: 12,
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: colors.teal,
    },
    secondaryButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.teal,
      fontSize: 16,
    },
  });
}
