import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS } from '../constants/theme';

export default function CheckoutFooterButton({ label, onPress, disabled }) {
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

const styles = StyleSheet.create({
  footer: {
    padding: 20,
    paddingBottom: 28,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 6,
  },
  button: {
    backgroundColor: COLORS.teal,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    fontFamily: FONTS.semiBold,
    color: '#ffffff',
    fontSize: 16,
  },
});
