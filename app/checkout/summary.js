import { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { formatCurrency, SELF_DRIVE_DELIVERY_FEE, calculateSecurityDeposit, calculateRentalPricing } from '../../constants/pricing';
import { fetchCarById } from '../../services/carsApi';
import { useCheckout } from '../../contexts/CheckoutContext';
import CheckoutHeader from '../../components/CheckoutHeader';
import CheckoutFooterButton from '../../components/CheckoutFooterButton';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CheckoutSummaryScreen() {
  const { carId } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const { activeCurrency } = useCurrency();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { draft, updateDraft } = useCheckout();

  const [car, setCar] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchCarById(carId)
      .then(setCar)
      .finally(() => setIsLoading(false));
  }, [carId]);

  const days = useMemo(() => {
    if (!draft.startDate || !draft.endDate || !car) return 0;
    return calculateRentalPricing({
      startDate: draft.startDate,
      endDate: draft.endDate,
      pickupTime: draft.pickupTime,
      returnTime: draft.returnTime,
      drivenBy: car.drivenBy,
      dailyRate: car.pricePerDay,
    }).billableDays;
  }, [draft.startDate, draft.endDate, draft.pickupTime, draft.returnTime, car]);

  // Pairs each selected addon with the day count chosen on the previous
  // screen (draft.addons is {name, days}[]) - a per_day addon is billed for
  // that many days, not the full trip length.
  const selectedAddons = useMemo(() => {
    if (!car) return [];
    return (car.regionalAddons ?? [])
      .map((addon) => {
        const selection = draft.addons.find((a) => a.name === addon.name);
        return selection ? { ...addon, days: selection.days } : null;
      })
      .filter(Boolean);
  }, [car, draft.addons]);

  const isSelfDrive = car?.drivenBy === 'Self-drive';

  const rentalCost = (car?.pricePerDay ?? 0) * days;
  const addonsCost = selectedAddons.reduce((sum, addon) => {
    return sum + (addon.type === 'per_day' ? addon.price * addon.days : addon.price);
  }, 0);
  const subtotal = rentalCost + addonsCost;
  const deliveryFee = isSelfDrive ? SELF_DRIVE_DELIVERY_FEE : 0;
  const securityDeposit = calculateSecurityDeposit(subtotal);
  const total = subtotal + deliveryFee + securityDeposit;

  const handleContinue = () => {
    updateDraft({ totalCost: total });
    router.push({ pathname: '/checkout/form', params: { carId } });
  };

  if (isLoading || !car) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CheckoutHeader title="Cost Breakdown" step={4} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.carName}>{car.name}</Text>

        <View style={styles.tripCard}>
          <View style={styles.tripRow}>
            <Text style={styles.tripLabel}>Pickup</Text>
            <Text style={styles.tripValue}>{formatDate(draft.startDate)} · {draft.pickupTime}</Text>
          </View>
          <View style={styles.tripRow}>
            <Text style={styles.tripLabel}>Return</Text>
            <Text style={styles.tripValue}>{formatDate(draft.endDate)} · {draft.returnTime}</Text>
          </View>
          <View style={styles.tripRow}>
            <Text style={styles.tripLabel}>Location</Text>
            <Text style={styles.tripValue} numberOfLines={1}>{draft.pickupLocation}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Cost Breakdown</Text>
        <View style={styles.costCard}>
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>{formatCurrency(car.pricePerDay, activeCurrency)} x {days} {days === 1 ? 'day' : 'days'}</Text>
            <Text style={styles.costValue}>{formatCurrency(rentalCost, activeCurrency)}</Text>
          </View>

          {selectedAddons.map((addon) => (
            <View style={styles.costRow} key={addon.name}>
              <Text style={styles.costLabel}>
                {addon.name}{addon.type === 'per_day' ? ` x ${addon.days} ${addon.days === 1 ? 'day' : 'days'}` : ''}
              </Text>
              <Text style={styles.costValue}>
                {formatCurrency(addon.type === 'per_day' ? addon.price * addon.days : addon.price, activeCurrency)}
              </Text>
            </View>
          ))}

          {isSelfDrive && (
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Delivery fee</Text>
              <Text style={styles.costValue}>{formatCurrency(deliveryFee, activeCurrency)}</Text>
            </View>
          )}

          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Security deposit (refundable)</Text>
            <Text style={styles.costValue}>{formatCurrency(securityDeposit, activeCurrency)}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.costRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCurrency(total, activeCurrency)}</Text>
          </View>
        </View>
      </ScrollView>

      <CheckoutFooterButton label="Proceed" onPress={handleContinue} />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carName: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  tripCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 10,
  },
  tripRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  tripLabel: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: colors.textSubtle,
  },
  tripValue: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  costCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  costLabel: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: colors.textMuted,
    flexShrink: 1,
    paddingRight: 8,
  },
  costValue: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
    marginBottom: 12,
  },
  totalLabel: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  totalValue: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    color: colors.teal,
  },
  });
}
