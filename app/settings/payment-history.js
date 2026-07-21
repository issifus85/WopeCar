import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { formatCurrency } from '../../constants/pricing';
import { useAppTheme } from '../../contexts/ThemeContext';
import * as bookingsApi from '../../services/bookingsApi';

const STATUS_META = {
  paid: { label: 'Paid', tone: 'success' },
  partial_payment: { label: 'Partially Paid', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  processing: { label: 'Processing', tone: 'warning' },
  unpaid: { label: 'Unpaid', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'error' },
};

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function PaymentRow({ payment, last, styles, colors }) {
  const meta = STATUS_META[payment.status] ?? { label: payment.status, tone: 'neutral' };
  const toneStyles = {
    success: [styles.pillSuccess, styles.pillTextSuccess],
    warning: [styles.pillWarning, styles.pillTextWarning],
    error: [styles.pillError, styles.pillTextError],
    neutral: [styles.pillNeutral, styles.pillTextNeutral],
  }[meta.tone];

  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <View style={styles.icon}>
        <Ionicons name="card-outline" size={18} color={colors.teal} />
      </View>
      <View style={styles.info}>
        <Text style={styles.amount}>{formatCurrency(payment.total)}</Text>
        <Text style={styles.subText}>{formatDate(payment.createdAt)} · {payment.gateway ?? 'N/A'}</Text>
      </View>
      <View style={[styles.pill, toneStyles[0]]}>
        <Text style={[styles.pillText, toneStyles[1]]}>{meta.label}</Text>
      </View>
    </View>
  );
}

export default function PaymentHistoryScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [payments, setPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(() => {
    setIsLoading(true);
    bookingsApi.getBookings()
      .then(setPayments)
      .catch(() => setPayments([]))
      .finally(() => setIsLoading(false));
  }, []);

  useFocusEffect(load);

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>A record of every payment tied to your bookings.</Text>

      {payments.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="card-outline" size={32} color={colors.disabled} />
          <Text style={styles.emptyStateText}>No payments yet.</Text>
        </View>
      ) : (
        <FlatList
          data={payments}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.card}
          renderItem={({ item, index }) => (
            <PaymentRow payment={item} last={index === payments.length - 1} styles={styles} colors={colors} />
          )}
        />
      )}
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
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    intro: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      lineHeight: 19,
      marginBottom: 16,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingHorizontal: 16,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    icon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    info: {
      flex: 1,
    },
    amount: {
      fontFamily: FONTS.semiBold,
      fontSize: 15,
      color: colors.textPrimary,
    },
    subText: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 2,
    },
    pill: {
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    pillText: {
      fontFamily: FONTS.semiBold,
      fontSize: 11,
    },
    pillSuccess: { backgroundColor: colors.successBg },
    pillTextSuccess: { color: colors.success },
    pillWarning: { backgroundColor: colors.warningBg },
    pillTextWarning: { color: colors.warning },
    pillError: { backgroundColor: colors.errorBg },
    pillTextError: { color: colors.error },
    pillNeutral: { backgroundColor: colors.divider },
    pillTextNeutral: { color: colors.textSubtle },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingBottom: 80,
    },
    emptyStateText: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textSubtle,
    },
  });
}
