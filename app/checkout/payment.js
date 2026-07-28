import { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { formatCurrency } from '../../constants/pricing';
import { fetchCarById } from '../../services/carsApi';
import { createBooking } from '../../services/bookingsApi';
import { payWithPaystack } from '../../services/paystackCheckout';
import { useCheckout } from '../../contexts/CheckoutContext';
import { useBookings } from '../../contexts/BookingsContext';
import { useCart } from '../../contexts/CartContext';
import { useInbox } from '../../contexts/InboxContext';
import CheckoutHeader from '../../components/CheckoutHeader';
import CheckoutFooterButton from '../../components/CheckoutFooterButton';

export default function CheckoutPaymentScreen() {
  const { carId } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const { activeCurrency } = useCurrency();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { draft, resetCheckout } = useCheckout();
  const { addBooking, updateBooking } = useBookings();
  const { removeFromCart } = useCart();
  const { notifyBookingEvent } = useInbox();

  const [car, setCar] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    fetchCarById(carId)
      .then(setCar)
      .finally(() => setIsLoading(false));
  }, [carId]);

  const handlePay = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const reference = await payWithPaystack(draft.totalCost);

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
        addons: draft.addons,
        totalCost: draft.totalCost,
        form: draft.form,
        paystackReference: reference,
        status: 'Pending',
        createdAt: new Date().toISOString(),
      };
      addBooking(booking);
      removeFromCart(carId);
      notifyBookingEvent('booking_created', booking);

      // Best-effort: creates the real server-side booking row, which
      // triggers a real client<->support conversation server-side (see
      // BookingApiController::store()). Payment already succeeded and the
      // local booking already exists by this point, so a failure here must
      // never be allowed to fail checkout - messaging for this booking
      // just won't be available until a later retry/sync.
      try {
        const serverBooking = await createBooking({
          carId,
          startDate: draft.startDate,
          endDate: draft.endDate,
          pickupTime: draft.pickupTime,
          returnTime: draft.returnTime,
          pickupLocation: draft.pickupLocation,
          returnLocation: draft.returnLocation,
          totalCost: draft.totalCost,
          addons: draft.addons,
          paystackReference: reference,
          licenseFront: draft.licenseFront,
          licenseBack: draft.licenseBack,
          proofOfAddress: draft.proofOfAddress,
        });
        updateBooking(booking.id, { serverId: serverBooking.id });
      } catch (e) {
        // swallowed by design - see comment above
      }

      resetCheckout();
      router.replace('/(tabs)/bookings');
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
      setIsProcessing(false);
    }
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
      <CheckoutHeader title="Payment" step={6} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.paystackBadge}>
          <Text style={styles.paystackText}>Paystack</Text>
        </View>

        <View style={styles.summaryCard}>
          {car.image ? (
            <Image source={{ uri: car.image }} style={styles.carImage} contentFit="cover" />
          ) : null}
          <View style={styles.summaryInfo}>
            <Text style={styles.carName} numberOfLines={1}>{car.name}</Text>
            <Text style={styles.totalLabel}>Amount due</Text>
            <Text style={styles.totalValue}>{formatCurrency(draft.totalCost, activeCurrency)}</Text>
          </View>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.teal} />
          <Text style={styles.infoText}>
            Secured by Paystack. Your card details are never stored on this device.
          </Text>
        </View>

        {isProcessing && (
          <View style={styles.processingBox}>
            <ActivityIndicator size="small" color={colors.teal} />
            <Text style={styles.processingText}>Processing payment...</Text>
          </View>
        )}

        {!!error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.termsRow}>
          <TouchableOpacity
            style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}
            onPress={() => setAgreedToTerms((prev) => !prev)}
            hitSlop={8}
          >
            {agreedToTerms && <Ionicons name="checkmark" size={14} color={colors.white} />}
          </TouchableOpacity>
          <Text style={styles.checkboxLabel} onPress={() => setAgreedToTerms((prev) => !prev)}>
            I agree to the{' '}
            <Text style={styles.termsLink} onPress={() => router.push('/terms')}>
              Terms of Service
            </Text>
          </Text>
        </View>
      </ScrollView>

      <CheckoutFooterButton
        label={isProcessing ? 'Processing...' : `Pay ${formatCurrency(draft.totalCost, activeCurrency)}`}
        onPress={handlePay}
        disabled={isProcessing || !agreedToTerms}
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
      backgroundColor: colors.background,
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
      color: colors.textPrimary,
      marginBottom: 6,
    },
    totalLabel: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
    },
    totalValue: {
      fontFamily: FONTS.bold,
      fontSize: 20,
      color: colors.teal,
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
      color: colors.textSubtle,
    },
    processingBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.highlight,
      borderRadius: 10,
      padding: 14,
    },
    processingText: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textPrimary,
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.errorBg,
      borderRadius: 10,
      padding: 14,
    },
    errorText: {
      flex: 1,
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.error,
    },
    termsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 16,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: colors.disabled,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    checkboxLabel: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textPrimary,
    },
    termsLink: {
      fontFamily: FONTS.semiBold,
      color: colors.teal,
      textDecorationLine: 'underline',
    },
  });
}
