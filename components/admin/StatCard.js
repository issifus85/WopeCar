import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';

export default function StatCard({ icon, label, value }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={18} color={colors.teal} />
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    card: {
      flexBasis: '48%',
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    iconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    value: {
      fontFamily: FONTS.bold,
      fontSize: 20,
      color: colors.textPrimary,
    },
    label: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 2,
    },
  });
}
