import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../../constants/theme';
import { useAppTheme } from '../../../../contexts/ThemeContext';
import { useCurrency } from '../../../../contexts/CurrencyContext';
import { formatCurrency } from '../../../../constants/pricing';
import { useVendor } from '../../../../contexts/VendorContext';
import VendorHeader from '../../../../components/VendorHeader';
import CheckoutFooterButton from '../../../../components/CheckoutFooterButton';
import CarPricingCalendar from '../../../../components/CarPricingCalendar';
import CarDiscountEditor from '../../../../components/CarDiscountEditor';

// Airbnb-host-style pricing screen: the calendar (custom per-date pricing)
// persists straight to car_date_prices as each edit is made, no Save step -
// see CarPricingCalendar. Discounts are different: they're plain columns on
// `cars` itself, so they're held in local state and written together via one
// Save, same as every other field on the Edit Listing screen.
export default function VendorCarPricingScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const { activeCurrency } = useCurrency();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { cars, isLoading, updateCar } = useVendor();

  const car = cars.find((c) => c.id === id);

  const [discount, setDiscount] = useState({ enabled: false, type: 'percentage', value: '', startsAt: null, endsAt: null });
  const [lengthOfStayDiscounts, setLengthOfStayDiscounts] = useState([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isInitialized || !car) return;
    setDiscount({
      enabled: !!car.discountEnabled,
      type: car.discountType || 'percentage',
      value: car.discountValue != null ? String(car.discountValue) : '',
      startsAt: car.discountStartsAt ?? null,
      endsAt: car.discountEndsAt ?? null,
    });
    setLengthOfStayDiscounts(
      (car.lengthOfStayDiscounts ?? []).map((tier) => ({
        minDays: tier.minDays != null ? String(tier.minDays) : '',
        type: tier.type || 'percentage',
        value: tier.value != null ? String(tier.value) : '',
      }))
    );
    setIsInitialized(true);
  }, [car, isInitialized]);

  if (isLoading || (car && !isInitialized)) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  if (!car) {
    return (
      <View style={styles.container}>
        <VendorHeader title="Pricing & Discounts" onBack={() => router.replace('/vendor/fleet')} />
        <View style={styles.centerState}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.disabled} />
          <Text style={styles.emptyText}>This car couldn't be found.</Text>
        </View>
      </View>
    );
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const cleanTiers = lengthOfStayDiscounts
        .filter((tier) => Number(tier.minDays) > 0 && Number(tier.value) > 0)
        .map((tier) => ({ minDays: Number(tier.minDays), type: tier.type, value: Number(tier.value) }));
      await updateCar(car.id, {
        discountEnabled: discount.enabled,
        discountType: discount.type,
        discountValue: discount.value ? Number(discount.value) : null,
        discountStartsAt: discount.startsAt,
        discountEndsAt: discount.endsAt,
        lengthOfStayDiscounts: cleanTiers,
      });
      router.replace(`/vendor/car/${car.id}`);
    } catch (e) {
      Alert.alert('Could not save changes', e?.message || 'Please check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <VendorHeader title={car.name} subtitle="Pricing & Discounts" onBack={() => router.replace(`/vendor/car/${car.id}`)} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Custom Date Pricing</Text>
        <Text style={styles.sectionHint}>
          Select one or more dates to set a custom price for this car. Any date you don't set keeps using the base price
          of {formatCurrency(car.pricePerDay, activeCurrency)}/day.
        </Text>
        <CarPricingCalendar carId={car.id} basePrice={car.pricePerDay} />

        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Discounts</Text>
        <CarDiscountEditor
          discount={discount}
          onChangeDiscount={setDiscount}
          lengthOfStayDiscounts={lengthOfStayDiscounts}
          onChangeLengthOfStayDiscounts={setLengthOfStayDiscounts}
        />
      </ScrollView>

      <CheckoutFooterButton
        label={isSaving ? 'Saving...' : 'Save Discount Settings'}
        onPress={handleSave}
        disabled={isSaving}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 20,
    },
    emptyText: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textSubtle,
      textAlign: 'center',
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    sectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.textSubtle,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    sectionSpaced: {
      marginTop: 24,
    },
    sectionHint: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      lineHeight: 17,
      marginBottom: 14,
    },
  });
}
