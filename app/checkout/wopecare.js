import { useState, useEffect, useMemo } from 'react';
import { StyleSheet, View, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAppTheme } from '../../contexts/ThemeContext';
import { calculateRentalPricing, calculateWopeCareDailyRate, calculateWopeCareCost, WOPECARE_PLANS } from '../../constants/pricing';
import { fetchCarById } from '../../services/carsApi';
import { useCheckout } from '../../contexts/CheckoutContext';
import CheckoutHeader from '../../components/CheckoutHeader';
import CheckoutFooterButton from '../../components/CheckoutFooterButton';
import ConfirmModal from '../../components/ConfirmModal';
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
  // Only fires when draft.wopeCare is still 'none' at the moment Continue
  // is pressed - a real plan (basic/plus/premium) skips this and goes
  // straight through, same as before.
  const [showNoWopeCareConfirm, setShowNoWopeCareConfirm] = useState(false);

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

  const proceedToSummary = () => {
    router.push({ pathname: '/checkout/summary', params: { carId } });
  };

  const handleContinue = () => {
    if (draft.wopeCare === 'none') {
      setShowNoWopeCareConfirm(true);
      return;
    }
    proceedToSummary();
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
      <CheckoutHeader title="Extra Add-ons" step={3} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <WopeCareSelector
          pricePerDay={car?.pricePerDay ?? 0}
          days={days}
          selectedPlan={draft.wopeCare}
          onSelect={(planId) => {
            updateDraft({ wopeCare: planId, wopeCareDetails: planId === 'none' ? null : WOPECARE_PLANS[planId] });
            if (planId === 'none') {
              // Used to auto-advance straight to /checkout/summary here -
              // now shows the same confirmation handleContinue's own
              // draft.wopeCare check shows, instead of calling
              // handleContinue() directly (its check would read the stale
              // pre-update draft from this render's closure).
              setShowNoWopeCareConfirm(true);
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

      <ConfirmModal
        visible={showNoWopeCareConfirm}
        title="Continue Without WopeCare?"
        message="You're proceeding without WopeCare protection. You'll remain responsible for the full cost of any damage to the vehicle during your trip, in accordance with your Rental Agreement."
        confirmLabel="Continue Without WopeCare"
        cancelLabel="Add WopeCare"
        onConfirm={() => {
          setShowNoWopeCareConfirm(false);
          proceedToSummary();
        }}
        onCancel={() => setShowNoWopeCareConfirm(false)}
      />
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
