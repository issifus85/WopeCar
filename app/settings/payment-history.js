import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator, TouchableOpacity, Modal, Pressable, Share, Platform, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { formatCurrency } from '../../constants/pricing';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../contexts/CurrencyContext';
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

function PaymentRow({ payment, last, onPress, styles, colors, currency }) {
  const meta = STATUS_META[payment.status] ?? { label: payment.status, tone: 'neutral' };
  const toneStyles = {
    success: [styles.pillSuccess, styles.pillTextSuccess],
    warning: [styles.pillWarning, styles.pillTextWarning],
    error: [styles.pillError, styles.pillTextError],
    neutral: [styles.pillNeutral, styles.pillTextNeutral],
  }[meta.tone];

  return (
    <TouchableOpacity style={[styles.row, last && styles.rowLast]} onPress={onPress}>
      <View style={styles.icon}>
        <Ionicons name="card-outline" size={18} color={colors.teal} />
      </View>
      <View style={styles.info}>
        <Text style={styles.amount}>{formatCurrency(payment.total, currency)}</Text>
        <Text style={styles.subText}>{formatDate(payment.createdAt)} · {payment.gateway ?? 'N/A'}</Text>
      </View>
      <View style={[styles.pill, toneStyles[0]]}>
        <Text style={[styles.pillText, toneStyles[1]]}>{meta.label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
    </TouchableOpacity>
  );
}

function buildReceiptText({ payment, meta, currency, userName }) {
  const lines = [
    'WopeCar Payment Receipt',
    '------------------------',
    payment.code ? `Reference: ${payment.code}` : null,
    userName ? `Billed to: ${userName}` : null,
    `Date: ${formatDate(payment.createdAt)}`,
    payment.startDate && payment.endDate
      ? `Rental Period: ${formatDate(payment.startDate)} - ${formatDate(payment.endDate)}`
      : null,
    `Amount Paid: ${formatCurrency(payment.paid, currency)}`,
    `Total: ${formatCurrency(payment.total, currency)}`,
    `Status: ${meta.label}`,
    `Payment Method: ${payment.gateway ?? 'N/A'}`,
  ].filter(Boolean);
  return lines.join('\n');
}

function ReceiptModal({ payment, currency, userName, onClose, styles, colors }) {
  if (!payment) return null;
  const meta = STATUS_META[payment.status] ?? { label: payment.status, tone: 'neutral' };

  const handleShare = async () => {
    const message = buildReceiptText({ payment, meta, currency, userName });
    try {
      // Same share-sheet pattern as car/[id].js::handleShare - on iOS the
      // share sheet includes "Save as PDF"/Print, which is as close to a
      // real downloadable receipt as this app gets without a backend
      // PDF-generation endpoint.
      await Share.share({ title: 'WopeCar Receipt', message });
    } catch (err) {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(message);
          Alert.alert('Copied', 'Receipt details copied to your clipboard.');
        } catch {
          // Nothing more we can do here.
        }
      }
    }
  };

  return (
    <Modal visible={!!payment} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Receipt</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {!!payment.code && (
            <View style={styles.sheetRow}>
              <Text style={styles.sheetLabel}>Reference</Text>
              <Text style={styles.sheetValue}>{payment.code}</Text>
            </View>
          )}
          <View style={styles.sheetRow}>
            <Text style={styles.sheetLabel}>Date</Text>
            <Text style={styles.sheetValue}>{formatDate(payment.createdAt)}</Text>
          </View>
          {!!payment.startDate && (
            <View style={styles.sheetRow}>
              <Text style={styles.sheetLabel}>Rental Period</Text>
              <Text style={styles.sheetValue}>{formatDate(payment.startDate)} - {formatDate(payment.endDate)}</Text>
            </View>
          )}
          <View style={styles.sheetRow}>
            <Text style={styles.sheetLabel}>Amount Paid</Text>
            <Text style={styles.sheetValue}>{formatCurrency(payment.paid, currency)}</Text>
          </View>
          <View style={styles.sheetRow}>
            <Text style={styles.sheetLabel}>Total</Text>
            <Text style={styles.sheetValue}>{formatCurrency(payment.total, currency)}</Text>
          </View>
          <View style={styles.sheetRow}>
            <Text style={styles.sheetLabel}>Status</Text>
            <Text style={styles.sheetValue}>{meta.label}</Text>
          </View>
          <View style={[styles.sheetRow, styles.sheetRowLast]}>
            <Text style={styles.sheetLabel}>Payment Method</Text>
            <Text style={styles.sheetValue}>{payment.gateway ?? 'N/A'}</Text>
          </View>

          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Ionicons name="share-outline" size={16} color={colors.white} />
            <Text style={styles.shareButtonText}>Share / Download</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function PaymentHistoryScreen() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const { activeCurrency } = useCurrency();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [payments, setPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState(null);

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
            <PaymentRow
              payment={item}
              last={index === payments.length - 1}
              onPress={() => setSelectedPayment(item)}
              styles={styles}
              colors={colors}
              currency={activeCurrency}
            />
          )}
        />
      )}

      <ReceiptModal
        payment={selectedPayment}
        currency={activeCurrency}
        userName={user?.name}
        onClose={() => setSelectedPayment(null)}
        styles={styles}
        colors={colors}
      />
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
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: 30,
    },
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    sheetTitle: {
      fontFamily: FONTS.bold,
      fontSize: 18,
      color: colors.textPrimary,
    },
    sheetRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    sheetRowLast: {
      borderBottomWidth: 0,
    },
    sheetLabel: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
    },
    sheetValue: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
    },
    shareButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.teal,
      borderRadius: 10,
      paddingVertical: 13,
      marginTop: 18,
    },
    shareButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.white,
    },
  });
}
