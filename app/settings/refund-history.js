import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';

// No refund model exists in the backend yet (bookings only track
// totalCost/paystackReference, not refund transactions) - an honest empty
// state, same call as Payment Methods above, rather than fabricating a
// refund history that isn't real.
export default function RefundHistoryScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.emptyState}>
        <Ionicons name="return-down-back-outline" size={32} color={colors.disabled} />
        <Text style={styles.emptyStateTitle}>No Refunds Yet</Text>
        <Text style={styles.emptyStateText}>
          Any refund WopeCar issues to you will show up here. To request one - for a cancelled trip or a security
          deposit - contact Support or start from the booking itself.
        </Text>
      </View>

      <View style={styles.linkRow}>
        <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.teal} />
        <Text style={styles.linkText} onPress={() => router.push('/support')}>
          Contact Support
        </Text>
      </View>
      <View style={styles.linkRow}>
        <Ionicons name="receipt-outline" size={18} color={colors.teal} />
        <Text style={styles.linkText} onPress={() => router.push('/settings/payment-history')}>
          View Payment History
        </Text>
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: 16,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 24,
      paddingBottom: 60,
    },
    emptyStateTitle: {
      fontFamily: FONTS.semiBold,
      fontSize: 15,
      color: colors.textPrimary,
      marginTop: 4,
    },
    emptyStateText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      textAlign: 'center',
      lineHeight: 19,
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
    },
    linkText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.teal,
    },
  });
}
