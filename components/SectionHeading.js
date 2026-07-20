import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

export default function SectionHeading({ children }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{children}</Text>
      <View style={styles.accent} />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    wrap: {
      marginBottom: 12,
    },
    text: {
      fontFamily: FONTS.bold,
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: 6,
    },
    accent: {
      width: 28,
      height: 3,
      borderRadius: 2,
      backgroundColor: colors.teal,
    },
  });
}
