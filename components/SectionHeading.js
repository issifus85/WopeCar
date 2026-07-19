import { StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS } from '../constants/theme';

export default function SectionHeading({ children }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{children}</Text>
      <View style={styles.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
  },
  text: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.navy,
    marginBottom: 6,
  },
  accent: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.teal,
  },
});
