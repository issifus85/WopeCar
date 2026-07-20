import { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS, FONTS } from '../../constants/theme';
import { formatCurrency, SELF_DRIVE_DELIVERY_FEE, calculateSecurityDeposit } from '../../constants/pricing';
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
  const { draft, updateDraft } = useCheckout();

  const [car, setCar] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchCarById(carId)
      .then(setCar)
      .finally(() => setIsLoading(false));
  }, [carId]);

  const days = useMemo(() => {
    if (!draft.startDate || !draft.endDate) return 0;
    const diff = new Date(draft.endDate) - new Date(draft.startDate);
    return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
  }, [draft.startDate, draft.endDate]);

  const selectedAddons = useMemo(() => {
    if (!car) return [];
    return (car.regionalAddons ?? []).filter(a => draft.addonNames.includes(a.name));
  }, [car, draft.addonNames]);

  const isSelfDrive = car?.drivenBy === 'Self-drive';

  const rentalCost = (car?.pricePerDay ?? 0) * days;
  const addonsCost = selectedAddons.reduce((sum, addon) => {
    return sum + (addon.type === 'per_day' ? addon.price * days : addon.price);
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
        <ActivityIndicator size="large" color={COLORS.teal} />
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
            <Text style={styles.costLabel}>{formatCurrency(car.pricePerDay)} x {days} {days === 1 ? 'day' : 'days'}</Text>
            <Text style={styles.costValue}>{formatCurrency(rentalCost)}</Text>
          </View>

          {selectedAddons.map((addon) => (
            <View style={styles.costRow} key={addon.name}>
              <Text style={styles.costLabel}>
                {addon.name}{addon.type === 'per_day' ? ` x ${days}` : ''}
              </Text>
              <Text style={styles.costValue}>
                {formatCurrency(addon.type === 'per_day' ? addon.price * days : addon.price)}
              </Text>
            </View>
          ))}

          {isSelfDrive && (
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Delivery fee</Text>
              <Text style={styles.costValue}>{formatCurrency(deliveryFee)}</Text>
            </View>
          )}

          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Security deposit (refundable)</Text>
            <Text style={styles.costValue}>{formatCurrency(securityDeposit)}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.costRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
          </View>
        </View>
      </ScrollView>

      <CheckoutFooterButton label="Proceed" onPress={handleContinue} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
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
    color: COLORS.navy,
    marginBottom: 16,
  },
  tripCard: {
    backgroundColor: COLORS.background,
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
    color: '#888',
  },
  tripValue: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: COLORS.navy,
    flexShrink: 1,
    textAlign: 'right',
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.navy,
    marginBottom: 12,
  },
  costCard: {
    backgroundColor: COLORS.background,
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
    color: '#666',
    flexShrink: 1,
    paddingRight: 8,
  },
  costValue: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.navy,
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e5e5',
    marginVertical: 4,
    marginBottom: 12,
  },
  totalLabel: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.navy,
  },
  totalValue: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    color: COLORS.teal,
  },
});
