import { useState, useEffect, useMemo } from 'react';
import { StyleSheet, View, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAppTheme } from '../../contexts/ThemeContext';
import { calculateRentalPricing, calculateWopeCareDailyRate, calculateWopeCareCost, WOPECARE_PLANS } from '../../constants/pricing';
import { fetchCarById } from '../../services/carsApi';
import { useCheckout } from '../../contexts/CheckoutContext';
import CheckoutHeader from '../../components/CheckoutHeader';
import CheckoutFooterButton from '../../components/CheckoutFooterButton';
import WopeCareSelector from '../../components/WopeCareSelector';
import { logScreen, logWopecareSelected } from '../../services/analytics';

// Split out of checkout/addons.js (previously combined with Regional
// Add-ons on one screen, WopeCare stacked above it) - Regional Add-ons now
// gets its own screen first (Step 3), this one second (Step 4), per the
// requested checkout ordering: regional add-ons, then WopeCare as an extra
// add-on.
export default function CheckoutWopeCareScreen() {
  const { carId } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { draft, updateDraft } = useCheckout();

  const [car, setCar] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchCarById(carId)
      .then(setCar)
      .finally(() => setIsLoading(false));
  }, [carId]);

  useEffect(() => {
    logScreen('Checkout_WopeCare');
  }, []);

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

  const handleContinue = () => {
    router.push({ pathname: '/checkout/summary', params: { carId } });
  };

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CheckoutHeader title="Extra Add-ons" step={4} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <WopeCareSelector
          pricePerDay={car?.pricePerDay ?? 0}
          days={days}
          selectedPlan={draft.wopeCare}
          onSelect={(planId) => {
            updateDraft({ wopeCare: planId, wopeCareDetails: planId === 'none' ? null : WOPECARE_PLANS[planId] });
            if (planId === 'none') {
              handleContinue();
              return;
            }
            if (car) {
              logWopecareSelected({
                plan: planId,
                dailyRate: calculateWopeCareDailyRate(car.pricePerDay, planId),
                totalCost: calculateWopeCareCost(car.pricePerDay, planId, days),
                carId,
              });
            }
          }}
        />
      </ScrollView>

      <CheckoutFooterButton label="Continue" onPress={handleContinue} />
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
  });
}
