import { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import {
  formatCurrency,
  getSelfDriveDeliveryFee,
  getWithDriverFeePerDay,
  calculateSecurityDeposit,
  calculateRentalPricing,
  WOPECARE_PLANS,
  calculateWopeCareCost,
  calculateWopeCareDailyRate,
} from '../../constants/pricing';
import { fetchCarById } from '../../services/carsApi';
import { getDatePriceMap } from '../../services/carPricingApi';
import { validatePromoCode } from '../../services/promoApi';
import { useCheckout } from '../../contexts/CheckoutContext';
import CheckoutHeader from '../../components/CheckoutHeader';
import CheckoutFooterButton from '../../components/CheckoutFooterButton';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function toISODate(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const [datePriceMap, setDatePriceMap] = useState({});

  useEffect(() => {
    fetchCarById(carId)
      .then(setCar)
      .finally(() => setIsLoading(false));
  }, [carId]);

  // Per-date custom pricing for just this trip's range - falls back to the
  // car's base price_per_day for any date without an override (see
  // calculateRentalPricing's getDatePrice).
  useEffect(() => {
    if (!carId || !draft.startDate || !draft.endDate) return;
    getDatePriceMap(carId, { fromDate: toISODate(draft.startDate), toDate: toISODate(draft.endDate) })
      .then(setDatePriceMap)
      .catch(() => {});
  }, [carId, draft.startDate, draft.endDate]);

  const pricing = useMemo(() => {
    if (!draft.startDate || !draft.endDate || !car) return null;
    return calculateRentalPricing({
      startDate: draft.startDate,
      endDate: draft.endDate,
      pickupTime: draft.pickupTime,
      returnTime: draft.returnTime,
      drivenBy: car.drivenBy,
      dailyRate: car.pricePerDay,
      getDatePrice: (iso) => datePriceMap[iso],
      lengthOfStayDiscounts: car.lengthOfStayDiscounts,
      discount: car.discount,
    });
  }, [draft.startDate, draft.endDate, draft.pickupTime, draft.returnTime, car, datePriceMap]);

  const days = pricing?.billableDays ?? 0;

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

  const rentalCost = pricing?.rentalCost ?? 0;
  const baseRentalCost = pricing?.baseRentalCost ?? 0;
  const hasDiscount = !!pricing && pricing.totalDiscount > 0;
  const addonsCost = selectedAddons.reduce((sum, addon) => {
    return sum + (addon.type === 'per_day' ? addon.price * addon.days : addon.price);
  }, 0);
  const subtotal = rentalCost + addonsCost;
  const deliveryFee = isSelfDrive ? getSelfDriveDeliveryFee() : 0;
  const securityDeposit = calculateSecurityDeposit(subtotal, car?.drivenBy);

  // Recomputed live from this screen's own `days` (not trusted from
  // draft.wopeCareDetails, a snapshot taken back on the addons screen) so
  // it stays correct if the renter goes back and changes dates after
  // picking a plan - same reasoning as rentalCost/addonsCost above.
  const wopeCarePlan = car && draft.wopeCare && draft.wopeCare !== 'none' ? WOPECARE_PLANS[draft.wopeCare] : null;
  const wopeCareDailyRate = wopeCarePlan ? calculateWopeCareDailyRate(car.pricePerDay, draft.wopeCare) : 0;
  const wopeCareCost = wopeCarePlan ? calculateWopeCareCost(car.pricePerDay, draft.wopeCare, days) : 0;

  // Self-drive-only add-on, recomputed live from the current admin-set rate
  // (same "never trust a stale draft snapshot" reasoning as the fields
  // above) - see constants/pricing.js's getWithDriverFeePerDay().
  const withDriverDailyRate = draft.withDriver ? getWithDriverFeePerDay() : 0;
  const withDriverCost = draft.withDriver ? withDriverDailyRate * days : 0;

  // Recomputed from the promo's own discount shape (not a stored amount) so
  // it stays correct if the renter goes back and changes dates/addons after
  // applying a code - see the comment on CheckoutContext's EMPTY_DRAFT.
  const promoDiscountAmount = useMemo(() => {
    if (!draft.promoCode) return 0;
    const amount = draft.promoDiscountType === 'percentage'
      ? subtotal * (draft.promoDiscountValue / 100)
      : draft.promoDiscountValue;
    return Math.min(subtotal, Math.max(0, amount));
  }, [draft.promoCode, draft.promoDiscountType, draft.promoDiscountValue, subtotal]);

  const total = subtotal - promoDiscountAmount + deliveryFee + securityDeposit + wopeCareCost + withDriverCost;

  const [promoInput, setPromoInput] = useState('');
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [promoError, setPromoError] = useState(null);

  const handleApplyPromo = async () => {
    if (!promoInput.trim()) return;
    setIsApplyingPromo(true);
    setPromoError(null);
    try {
      const result = await validatePromoCode(promoInput.trim());
      updateDraft({ promoCode: result.code, promoDiscountType: result.discountType, promoDiscountValue: result.discountValue });
      setPromoInput('');
    } catch (e) {
      setPromoError(e.message || 'Invalid promo code.');
    } finally {
      setIsApplyingPromo(false);
    }
  };

  const handleRemovePromo = () => {
    setPromoError(null);
    updateDraft({ promoCode: null, promoDiscountType: null, promoDiscountValue: 0 });
  };

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

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
            <Text style={styles.costLabel}>Rental ({days} {days === 1 ? 'day' : 'days'})</Text>
            <View style={styles.costValueGroup}>
              {hasDiscount && (
                <Text style={styles.strikethroughValue}>{formatCurrency(baseRentalCost, activeCurrency)}</Text>
              )}
              <Text style={styles.costValue}>{formatCurrency(rentalCost, activeCurrency)}</Text>
            </View>
          </View>

          {hasDiscount && (
            <View style={styles.costRow}>
              <Text style={[styles.costLabel, styles.discountLabel]}>
                {pricing.appliedLengthOfStayTier ? 'Length of trip + listing discount' : 'Listing discount applied'}
              </Text>
              <Text style={styles.discountValue}>-{formatCurrency(pricing.totalDiscount, activeCurrency)}</Text>
            </View>
          )}

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

          {!!draft.withDriver && (
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>With Driver ({days} {days === 1 ? 'day' : 'days'})</Text>
              <Text style={styles.costValue}>{formatCurrency(withDriverCost, activeCurrency)}</Text>
            </View>
          )}

          {wopeCarePlan ? (
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>
                {wopeCarePlan.name} ({formatCurrency(wopeCareDailyRate, activeCurrency)}/day)
              </Text>
              <Text style={styles.costValue}>{formatCurrency(wopeCareCost, activeCurrency)}</Text>
            </View>
          ) : (
            <View style={styles.costRow}>
              <Text style={[styles.costLabel, styles.noProtectionLabel]}>No Protection Selected</Text>
              <TouchableOpacity onPress={() => router.push({ pathname: '/checkout/wopecare', params: { carId } })}>
                <Text style={styles.addProtectionLink}>Add Protection →</Text>
              </TouchableOpacity>
            </View>
          )}

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

          {promoDiscountAmount > 0 && (
            <View style={styles.costRow}>
              <Text style={[styles.costLabel, styles.discountLabel]}>Promo code ({draft.promoCode})</Text>
              <Text style={styles.discountValue}>-{formatCurrency(promoDiscountAmount, activeCurrency)}</Text>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.costRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCurrency(total, activeCurrency)}</Text>
          </View>
        </View>

        <View style={styles.promoCard}>
          <Text style={styles.promoTitle}>Promo Code</Text>
          {draft.promoCode ? (
            <View style={styles.promoAppliedRow}>
              <View style={styles.promoAppliedInfo}>
                <Ionicons name="pricetag" size={16} color={colors.success} />
                <Text style={styles.promoAppliedText}>{draft.promoCode} applied</Text>
              </View>
              <TouchableOpacity onPress={handleRemovePromo} hitSlop={8}>
                <Text style={styles.promoRemoveText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.promoInputRow}>
              <TextInput
                style={styles.promoInput}
                value={promoInput}
                onChangeText={(value) => { setPromoInput(value); setPromoError(null); }}
                placeholder="Enter code"
                placeholderTextColor={colors.textSubtle}
                autoCapitalize="characters"
                editable={!isApplyingPromo}
              />
              <TouchableOpacity
                style={[styles.promoApplyButton, (!promoInput.trim() || isApplyingPromo) && styles.promoApplyButtonDisabled]}
                onPress={handleApplyPromo}
                disabled={!promoInput.trim() || isApplyingPromo}
              >
                {isApplyingPromo
                  ? <ActivityIndicator size="small" color={colors.white} />
                  : <Text style={styles.promoApplyButtonText}>Apply</Text>}
              </TouchableOpacity>
            </View>
          )}
          {!!promoError && <Text style={styles.promoErrorText}>{promoError}</Text>}
        </View>
      </ScrollView>

      <CheckoutFooterButton label="Proceed" onPress={handleContinue} />
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  flex: {
    flex: 1,
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
  costValueGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  strikethroughValue: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: colors.textSubtle,
    textDecorationLine: 'line-through',
  },
  discountLabel: {
    color: colors.success,
  },
  noProtectionLabel: {
    color: colors.textSubtle,
  },
  addProtectionLink: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: colors.teal,
  },
  discountValue: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: colors.success,
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
    color: colors.textPrimary,
  },
  promoCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  promoTitle: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 10,
  },
  promoInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  promoInput: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  promoApplyButton: {
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teal,
  },
  promoApplyButtonDisabled: {
    opacity: 0.5,
  },
  promoApplyButtonText: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    color: colors.white,
  },
  promoAppliedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  promoAppliedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  promoAppliedText: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    color: colors.success,
  },
  promoRemoveText: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: colors.error,
  },
  promoErrorText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: colors.error,
    marginTop: 8,
  },
  });
}
