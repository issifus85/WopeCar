import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { formatCurrency } from '../constants/pricing';

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Purely presentational - renders whatever fields are present in the
// `summary` object. No client-side role logic: the backend has already
// trimmed customer-contact-detail fields out for non-owner viewers (see
// ConversationController::buildPinnedSummary on the backend) - this
// component just displays what it's given either way.
export default function PinnedBookingSummary({ summary }) {
  const { colors } = useAppTheme();
  const { activeCurrency } = useCurrency();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!summary) return null;

  return (
    <View style={styles.card}>
      {summary.carImage ? (
        <Image source={{ uri: summary.carImage }} style={styles.image} contentFit="cover" />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Text style={styles.imagePlaceholderText}>🚗</Text>
        </View>
      )}
      <View style={styles.info}>
        <View style={styles.topRow}>
          <Text style={styles.carName} numberOfLines={1}>{summary.carName}</Text>
          {!!summary.status && (
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>{summary.status}</Text>
            </View>
          )}
        </View>
        {!!summary.customerName && <Text style={styles.customerName}>{summary.customerName}</Text>}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Pickup</Text>
          <Text style={styles.detailValue} numberOfLines={1}>
            {formatDateTime(summary.pickupDateTime)}{summary.pickupAddress ? ` · ${summary.pickupAddress}` : ''}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Return</Text>
          <Text style={styles.detailValue} numberOfLines={1}>
            {formatDateTime(summary.returnDateTime)}{summary.returnAddress ? ` · ${summary.returnAddress}` : ''}
          </Text>
        </View>
        {typeof summary.totalCost === 'number' && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Total</Text>
            <Text style={styles.detailValue}>{formatCurrency(summary.totalCost, activeCurrency)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      gap: 10,
      margin: 12,
      padding: 10,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    image: {
      width: 56,
      height: 56,
      borderRadius: 8,
    },
    imagePlaceholder: {
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    imagePlaceholderText: {
      fontSize: 20,
    },
    info: {
      flex: 1,
      gap: 2,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    carName: {
      flex: 1,
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    statusPill: {
      backgroundColor: colors.highlight,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    statusText: {
      fontFamily: FONTS.semiBold,
      fontSize: 9,
      color: colors.teal,
      textTransform: 'capitalize',
    },
    customerName: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textMuted,
      marginBottom: 2,
    },
    detailRow: {
      flexDirection: 'row',
      gap: 6,
    },
    detailLabel: {
      fontFamily: FONTS.medium,
      fontSize: 11,
      color: colors.textSubtle,
      width: 46,
    },
    detailValue: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textPrimary,
    },
  });
}
