import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, ScrollView, Image, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../constants/theme';
import { formatCurrency } from '../../constants/pricing';
import { fetchCarById } from '../../services/carsApi';
import { initializePayment, verifyPayment, buildPaystackCallbackUrl } from '../../services/paystackApi';
import { useCheckout } from '../../contexts/CheckoutContext';
import { useBookings } from '../../contexts/BookingsContext';
import { useCart } from '../../contexts/CartContext';
import CheckoutHeader from '../../components/CheckoutHeader';
import CheckoutFooterButton from '../../components/CheckoutFooterButton';

// On web, window.open() is only trusted as "user-initiated" when called
// synchronously inside the click handler - calling it after the
// initializePayment() await gets silently popup-blocked. So on web we open
// a blank tab immediately and redirect it once the checkout URL is ready,
// then poll its location for our callback URL (reading it throws while the
// tab is on Paystack's origin - that's expected, just keep polling).
function waitForWebPopupRedirect(popup, callbackUrl) {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (popup.closed) {
        clearInterval(interval);
        resolve({ type: 'cancel' });
        return;
      }
      let currentUrl;
      try {
        currentUrl = popup.location.href;
      } catch {
        return;
      }
      if (currentUrl && currentUrl.startsWith(callbackUrl)) {
        clearInterval(interval);
        popup.close();
        resolve({ type: 'success', url: currentUrl });
      }
    }, 500);
  });
}

export default function CheckoutPaymentScreen() {
  const { carId } = useLocalSearchParams();
  const router = useRouter();
  const { draft, resetCheckout } = useCheckout();
  const { addBooking } = useBookings();
  const { removeFromCart } = useCart();

  const [car, setCar] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCarById(carId)
      .then(setCar)
      .finally(() => setIsLoading(false));
  }, [carId]);

  const handlePay = async () => {
    setIsProcessing(true);
    setError(null);

    let popup = null;
    if (Platform.OS === 'web') {
      popup = window.open('about:blank', '_blank');
      if (!popup) {
        setError('Please allow pop-ups for this site to complete payment.');
        setIsProcessing(false);
        return;
      }
    }

    try {
      const appRedirectUrl = Linking.createURL('payment-callback');
      const { authorization_url: authUrl, reference } = await initializePayment({
        amount: draft.totalCost,
        callbackUrl: buildPaystackCallbackUrl(appRedirectUrl),
      });

      let result;
      if (Platform.OS === 'web') {
        popup.location.href = authUrl;
        result = await waitForWebPopupRedirect(popup, appRedirectUrl);
      } else {
        result = await WebBrowser.openAuthSessionAsync(authUrl, appRedirectUrl);
      }

      if (result.type !== 'success') {
        setError('Payment was cancelled.');
        setIsProcessing(false);
        return;
      }

      const verification = await verifyPayment(reference);
      if (verification.transaction_status !== 'success') {
        setError('Payment was not successful. Please try again.');
        setIsProcessing(false);
        return;
      }

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
        paystackReference: reference,
        status: 'Pending',
        createdAt: new Date().toISOString(),
      };
      addBooking(booking);
      removeFromCart(carId);
      resetCheckout();
      router.replace('/(tabs)/bookings');
    } catch (e) {
      if (popup && !popup.closed) popup.close();
      setError(e.message || 'Something went wrong. Please try again.');
      setIsProcessing(false);
    }
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
            <Text style={styles.totalValue}>{formatCurrency(draft.totalCost)}</Text>
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

        {!!error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color="#C62828" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>

      <CheckoutFooterButton
        label={isProcessing ? 'Processing...' : `Pay ${formatCurrency(draft.totalCost)}`}
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
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFEBEE',
    borderRadius: 10,
    padding: 14,
  },
  errorText: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: '#C62828',
  },
});
