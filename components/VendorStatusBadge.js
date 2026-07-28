import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

// Shared status-color mapping for every Vendor Mode badge (fleet car
// status, booking request/history status) - generalizes the
// getStatusColors(colors) pattern already used in (tabs)/bookings.js and
// booking/[id].js so Fleet/History/Bookings don't each reinvent it.
const STATUS_VARIANT = {
  Active: 'success',
  Confirmed: 'success',
  Completed: 'success',
  Pending: 'warning',
  Requested: 'warning',
  Inactive: 'muted',
  Declined: 'error',
  Cancelled: 'error',
};

export default function VendorStatusBadge({ status }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const variant = STATUS_VARIANT[status] ?? 'muted';

  return (
    <View style={[styles.badge, styles[`badge_${variant}`]]}>
      <Text style={[styles.text, styles[`text_${variant}`]]}>{status}</Text>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    text: {
      fontFamily: FONTS.semiBold,
      fontSize: 10,
    },
    badge_success: { backgroundColor: colors.successBg },
    text_success: { color: colors.success },
    badge_warning: { backgroundColor: colors.warningBg },
    text_warning: { color: colors.warning },
    badge_error: { backgroundColor: colors.errorBg },
    text_error: { color: colors.error },
    badge_muted: { backgroundColor: colors.divider },
    text_muted: { color: colors.textSubtle },
  });
}
