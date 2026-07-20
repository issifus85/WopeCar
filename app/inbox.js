import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

export default function InboxScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Inbox</Text>
      <Text style={styles.subtitle}>You have no messages yet.</Text>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    title: {
      fontFamily: FONTS.bold,
      fontSize: 22,
      color: colors.textPrimary,
      marginBottom: 8,
    },
    subtitle: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textMuted,
    },
  });
}
