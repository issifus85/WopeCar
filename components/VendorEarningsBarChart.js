import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

// Plain View-based bar chart - no charting library in this app (same
// reasoning as the Inspection module's damage diagram: a static, hand-built
// visual beats a new dependency for one simple use case). Per-bar amounts
// are intentionally not rendered here (money is only ever shown via
// formatCurrency() per PROJECT.md's styling conventions, and a currency-
// symbol label wouldn't fit six narrow bar columns) - the exact current
// month figure is shown in the dashboard's earnings card above this chart.
const CHART_HEIGHT = 110;

export default function VendorEarningsBarChart({ data }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const maxTotal = Math.max(1, ...data.map((month) => month.total));

  return (
    <View style={styles.container}>
      {data.map((month, index) => {
        const isCurrent = index === data.length - 1;
        const barHeight = Math.max(6, Math.round((month.total / maxTotal) * CHART_HEIGHT));
        return (
          <View key={month.key} style={styles.column}>
            <View style={styles.track}>
              <View style={[styles.bar, { height: barHeight }, isCurrent && styles.barCurrent]} />
            </View>
            <Text style={[styles.label, isCurrent && styles.labelCurrent]}>{month.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      height: CHART_HEIGHT + 26,
      paddingTop: 8,
    },
    column: {
      flex: 1,
      alignItems: 'center',
    },
    track: {
      height: CHART_HEIGHT,
      justifyContent: 'flex-end',
    },
    bar: {
      width: 18,
      borderRadius: 5,
      backgroundColor: colors.disabled,
    },
    barCurrent: {
      backgroundColor: colors.teal,
    },
    label: {
      fontFamily: FONTS.medium,
      fontSize: 11,
      color: colors.textSubtle,
      marginTop: 8,
    },
    labelCurrent: {
      fontFamily: FONTS.semiBold,
      color: colors.textPrimary,
    },
  });
}
