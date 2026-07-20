import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

export default function CheckoutFooterButton({ label, onPress, disabled }) {
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
  });
}
