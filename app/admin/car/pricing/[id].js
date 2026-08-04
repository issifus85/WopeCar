import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FONTS } from '../../../../constants/theme';
import { useAppTheme } from '../../../../contexts/ThemeContext';
import { formatCurrency } from '../../../../constants/pricing';
import { getCar, updateCar } from '../../../../services/adminCarsApi';
import CheckoutFooterButton from '../../../../components/CheckoutFooterButton';
import CarPricingCalendar from '../../../../components/CarPricingCalendar';
import CarDiscountEditor from '../../../../components/CarDiscountEditor';

// Admin's counterpart to app/vendor/car/pricing/[id].js - same two
// mechanisms (custom per-date pricing + discounts) for any vendor's car,
// reading/writing the raw DB shape directly via adminCarsApi like
// app/admin/car/edit/[id].js already does, rather than a per-vendor cache.
export default function AdminCarPricingScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [car, setCar] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [discount, setDiscount] = useState({ enabled: false, type: 'percentage', value: '', startsAt: null, endsAt: null });
  const [lengthOfStayDiscounts, setLengthOfStayDiscounts] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getCar(id)
      .then((row) => {
        if (cancelled) return;
        setCar(row);
        setDiscount({
          enabled: !!row.discount_enabled,
          type: row.discount_type || 'percentage',
          value: row.discount_value != null ? String(row.discount_value) : '',
          startsAt: row.discount_starts_at ?? null,
          endsAt: row.discount_ends_at ?? null,
        });
        setLengthOfStayDiscounts(
          (row.length_of_stay_discounts ?? []).map((tier) => ({
            minDays: tier.minDays != null ? String(tier.minDays) : '',
            type: tier.type || 'percentage',
            value: tier.value != null ? String(tier.value) : '',
          }))
        );
      })
      .catch((e) => !cancelled && setLoadError(e.message || 'Could not load this car.'))
      .finally(() => !cancelled && setIsLoading(false));
    return () => { cancelled = true; };
  }, [id]);

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  if (!car) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.emptyText}>{loadError || 'This car could not be found.'}</Text>
      </View>
    );
  }

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const cleanTiers = lengthOfStayDiscounts
        .filter((tier) => Number(tier.minDays) > 0 && Number(tier.value) > 0)
        .map((tier) => ({ minDays: Number(tier.minDays), type: tier.type, value: Number(tier.value) }));
      await updateCar(car, {
        discountEnabled: discount.enabled,
        discountType: discount.type,
        discountValue: discount.value ? Number(discount.value) : null,
        discountStartsAt: discount.startsAt,
        discountEndsAt: discount.endsAt,
        lengthOfStayDiscounts: cleanTiers,
      });
      router.back();
    } catch (e) {
      setSaveError(e.message || 'Could not save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Pricing & Discounts</Text>
        <Text style={styles.subtitle}>{car.name}</Text>

        <Text style={styles.sectionTitle}>Custom Date Pricing</Text>
        <Text style={styles.sectionHint}>
          Select one or more dates to set a custom price for this car. Any date left unset keeps using the base price
          of {formatCurrency(car.price_per_day)}/day.
        </Text>
        <CarPricingCalendar carId={car.id} basePrice={car.price_per_day} />

        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Discounts</Text>
        <CarDiscountEditor
          discount={discount}
          onChangeDiscount={setDiscount}
          lengthOfStayDiscounts={lengthOfStayDiscounts}
          onChangeLengthOfStayDiscounts={setLengthOfStayDiscounts}
        />

        {!!saveError && <Text style={styles.errorText}>{saveError}</Text>}
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
      backgroundColor: colors.background,
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
    title: {
      fontFamily: FONTS.bold,
      fontSize: 20,
      color: colors.textPrimary,
    },
    subtitle: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      marginTop: 2,
      marginBottom: 20,
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
    errorText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.error,
      textAlign: 'center',
      marginTop: 8,
    },
  });
}
