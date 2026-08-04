import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';

// Generic status/role pill, reused everywhere an admin screen needs to show
// a colored label for a state - user role, verification, booking status,
// vendor/car approval state, payment status. `tone` picks from the theme's
// existing semantic bg/text pairs (colors.js) - never a new hardcoded hex.
const TONES = {
  neutral: (colors) => ({ bg: colors.highlight, text: colors.teal }),
  success: (colors) => ({ bg: colors.successBg, text: colors.success }),
  warning: (colors) => ({ bg: colors.warningBg, text: colors.warning }),
  error: (colors) => ({ bg: colors.errorBg, text: colors.error }),
  muted: (colors) => ({ bg: colors.divider, text: colors.textMuted }),
};

export default function BadgeStatus({ label, tone = 'neutral' }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, tone), [colors, tone]);
  return <Text style={styles.badge}>{label}</Text>;
}

function createStyles(colors, tone) {
  const { bg, text } = (TONES[tone] || TONES.neutral)(colors);
  return StyleSheet.create({
    badge: {
      alignSelf: 'flex-start',
      fontFamily: FONTS.semiBold,
      fontSize: 11,
      color: text,
      backgroundColor: bg,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      overflow: 'hidden',
    },
  });
}
