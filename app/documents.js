import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

export default function DocumentsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Ionicons name="folder-outline" size={40} color={colors.disabled} />
      <Text style={styles.title}>Documents</Text>
      <Text style={styles.subtitle}>Your saved documents will be available here soon.</Text>
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
      gap: 6,
    },
    title: {
      fontFamily: FONTS.bold,
      fontSize: 22,
      color: colors.textPrimary,
      marginTop: 4,
    },
    subtitle: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
    },
  });
}
