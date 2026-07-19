import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, ScrollView, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../constants/theme';
import { fetchCarById } from '../../services/carsApi';
import { useCheckout } from '../../contexts/CheckoutContext';
import { useBookings } from '../../contexts/BookingsContext';
import { useCart } from '../../contexts/CartContext';
import CheckoutHeader from '../../components/CheckoutHeader';
import CheckoutFooterButton from '../../components/CheckoutFooterButton';

export default function CheckoutPaymentScreen() {
  const { carId } = useLocalSearchParams();
  const router = useRouter();
  const { draft, resetCheckout } = useCheckout();
  const { addBooking } = useBookings();
  const { removeFromCart } = useCart();

  const [car, setCar] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchCarById(carId)
      .then(setCar)
      .finally(() => setIsLoading(false));
  }, [carId]);

  const handlePay = () => {
    setIsProcessing(true);
    // Simulated charge - Paystack's live keys live in the backend's admin
    // settings table (not accessible from this codebase) and no
    // Sanctum-authenticated checkout/payment API exists yet, so this mimics
    // the Paystack flow's timing/UX without moving real money. Wiring a real
    // charge is a follow-up backend phase.
    setTimeout(() => {
      const booking = {
        id: `local-${Date.now()}`,
        carId,
        carName: car?.name,
        carImage: car?.image,
        startDate: draft.startDate,
        endDate: draft.endDate,
        pickupTime: draft.pickupTime,
        returnTime: draft.returnTime,
        pickupLocation: draft.pickupLocation,
        returnLocation: draft.returnLocation,
        addonNames: draft.addonNames,
        totalCost: draft.totalCost,
        form: draft.form,
        status: 'Pending',
        createdAt: new Date().toISOString(),
      };
      addBooking(booking);
      removeFromCart(carId);
      resetCheckout();
      setIsProcessing(false);
      router.replace('/(tabs)/bookings');
    }, 1600);
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
      <CheckoutHeader title="Payment" step={6} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.paystackBadge}>
          <Text style={styles.paystackText}>Paystack</Text>
        </View>

        <View style={styles.summaryCard}>
          {car.image ? (
            <Image source={{ uri: car.image }} style={styles.carImage} resizeMode="cover" />
          ) : null}
          <View style={styles.summaryInfo}>
            <Text style={styles.carName} numberOfLines={1}>{car.name}</Text>
            <Text style={styles.totalLabel}>Amount due</Text>
            <Text style={styles.totalValue}>${(draft.totalCost ?? 0).toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="lock-closed-outline" size={16} color={COLORS.teal} />
          <Text style={styles.infoText}>
            Secured by Paystack. Your card details are never stored on this device.
          </Text>
        </View>

        {isProcessing && (
          <View style={styles.processingBox}>
            <ActivityIndicator size="small" color={COLORS.teal} />
            <Text style={styles.processingText}>Processing payment...</Text>
          </View>
        )}
      </ScrollView>

      <CheckoutFooterButton
        label={isProcessing ? 'Processing...' : `Pay $${(draft.totalCost ?? 0).toFixed(2)}`}
        onPress={handlePay}
        disabled={isProcessing}
      />
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
  paystackBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#00C3F1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 20,
  },
  paystackText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: '#ffffff',
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  carImage: {
    width: 64,
    height: 64,
    borderRadius: 10,
  },
  summaryInfo: {
    flex: 1,
  },
  carName: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    color: COLORS.navy,
    marginBottom: 6,
  },
  totalLabel: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#888',
  },
  totalValue: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: COLORS.teal,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  infoText: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#888',
  },
  processingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#EEF9F9',
    borderRadius: 10,
    padding: 14,
  },
  processingText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.navy,
  },
});
