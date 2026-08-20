import { StyleSheet, Text, View, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { formatCurrency } from '../../constants/pricing';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCheckout } from '../../contexts/CheckoutContext';
import { fetchCarById } from '../../services/carsApi';
import CarListCard from '../../components/CarListCard';
import ConfirmModal from '../../components/ConfirmModal';

function formatShortDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// hoursLeft is a plain number (not a Date diff) so callers doing the
// under-6h/under-2h color check and the "Expires in X hours" label read
// off the exact same value - no risk of the two drifting a render apart.
function hoursUntil(iso) {
  return (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60);
}

function SavedBookingCard({ booking, onCompletePayment, onRemove, onSearchAgain, styles, colors, currency }) {
  const hoursLeft = hoursUntil(booking.expiresAt);
  const isExpired = hoursLeft <= 0;

  if (isExpired) {
    return (
      <View style={styles.savedCard}>
        <View style={styles.expiredHeader}>
          <Ionicons name="time-outline" size={18} color={colors.error} />
          <Text style={styles.expiredTitle}>This booking has expired</Text>
        </View>
        <Text style={styles.expiredBody}>
          Your saved booking for {booking.carName} is no longer held.
        </Text>
        <TouchableOpacity style={styles.searchAgainButton} onPress={onSearchAgain}>
          <Text style={styles.searchAgainButtonText}>Search Again</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.teal} />
        </TouchableOpacity>
      </View>
    );
  }

  const countdownColor = hoursLeft < 2 ? colors.error : hoursLeft < 6 ? colors.warning : colors.textSubtle;
  const countdownLabel = hoursLeft < 1 ? 'Expires in less than 1 hour' : `Expires in ${Math.round(hoursLeft)} ${Math.round(hoursLeft) === 1 ? 'hour' : 'hours'}`;

  return (
    <View style={styles.savedCard}>
      <View style={styles.savedCardTop}>
        {booking.carImage ? (
          <Image source={{ uri: booking.carImage }} style={styles.savedCarImage} contentFit="cover" />
        ) : null}
        <View style={styles.savedCardInfo}>
          <Text style={styles.savedCarName} numberOfLines={1}>{booking.carName}</Text>
          <Text style={styles.savedCardDates}>
            {formatShortDate(booking.startDate)} → {formatShortDate(booking.endDate)}
            {booking.totalDays ? ` · ${booking.totalDays} ${booking.totalDays === 1 ? 'day' : 'days'}` : ''}
          </Text>
          <Text style={styles.savedCardTotal}>{formatCurrency(booking.totalCost, currency)}</Text>
        </View>
        <TouchableOpacity onPress={onRemove} hitSlop={8}>
          <Ionicons name="close-circle" size={22} color={colors.textSubtle} />
        </TouchableOpacity>
      </View>

      {!!booking.bookingRef && (
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>⏳ Payment Pending · {booking.bookingRef}</Text>
        </View>
      )}

      <View style={styles.countdownRow}>
        <Ionicons name="time-outline" size={14} color={countdownColor} />
        <Text style={[styles.countdownText, { color: countdownColor }]}>{countdownLabel}</Text>
      </View>

      <TouchableOpacity style={styles.completePaymentButton} onPress={onCompletePayment}>
        <Text style={styles.completePaymentButtonText}>Complete Payment</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function CartScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { activeCurrency } = useCurrency();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { cartIds, removeFromCart, savedBookings, removeSavedBooking } = useCart();
  const { user } = useAuth();
  const { startCheckout, updateDraft } = useCheckout();
  const [cars, setCars] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [removeTarget, setRemoveTarget] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (!cartIds.length) {
        setCars([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      Promise.all(cartIds.map(id => fetchCarById(id).catch(() => null)))
        .then(results => setCars(results.filter(Boolean)))
        .finally(() => setIsLoading(false));
    }, [cartIds])
  );

  const handleCheckout = (carId) => {
    if (!user) {
      router.push({ pathname: '/login', params: { redirect: '/checkout/dates', carId } });
      return;
    }
    startCheckout(carId);
    router.push({ pathname: '/checkout/dates', params: { carId } });
  };

  // Skips straight to Payment with every saved field restored - the same
  // "never trust a stale draft snapshot" rule the rest of checkout follows
  // still applies once there: payment.js recomputes the itemized cost
  // breakdown fresh from these restored dates/addons rather than trusting
  // booking.totalCost for anything but the top-line "Amount due" display.
  const handleCompletePayment = (booking) => {
    startCheckout(booking.carId);
    updateDraft({
      startDate: booking.startDate,
      endDate: booking.endDate,
      pickupTime: booking.pickupTime,
      returnTime: booking.returnTime,
      pickupLocation: booking.pickupLocation,
      returnLocation: booking.returnLocation,
      addons: booking.addons,
      wopeCare: booking.wopeCare?.plan ?? 'none',
      totalCost: booking.totalCost,
      form: booking.form,
      licenseFront: booking.licenseFront,
      licenseBack: booking.licenseBack,
      proofOfAddress: booking.proofOfAddress,
    });
    router.push({ pathname: '/checkout/payment', params: { carId: booking.carId, resumedBookingId: booking.id } });
  };

  const isEmpty = !cars.length && !savedBookings.length;

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  if (isEmpty) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="cart-outline" size={40} color={colors.disabled} />
        <Text style={styles.title}>Your cart is empty</Text>
        <Text style={styles.subtitle}>
          Browse cars and save bookings to complete payment when you're ready.
        </Text>
        <TouchableOpacity style={styles.browseButton} onPress={() => router.push('/(tabs)')}>
          <Text style={styles.browseButtonText}>Browse Cars</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.white} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Cart</Text>
      </View>
      <FlatList
        data={[
          ...savedBookings.map(b => ({ kind: 'saved', ...b })),
          ...cars.map(c => ({ kind: 'wishlist', ...c })),
        ]}
        keyExtractor={item => (item.kind === 'saved' ? item.id : `wishlist-${item.id}`)}
        renderItem={({ item }) => (
          item.kind === 'saved' ? (
            <View style={styles.cartItem}>
              <SavedBookingCard
                booking={item}
                onCompletePayment={() => handleCompletePayment(item)}
                onRemove={() => setRemoveTarget(item)}
                onSearchAgain={() => {
                  removeSavedBooking(item.id);
                  router.push('/(tabs)');
                }}
                styles={styles}
                colors={colors}
                currency={activeCurrency}
              />
            </View>
          ) : (
            <View style={styles.cartItem}>
              <CarListCard car={item} onPress={() => router.push(`/car/${item.id}`)} />
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeFromCart(item.id)}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={22} color={colors.textSubtle} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.checkoutButton}
                onPress={() => handleCheckout(item.id)}
              >
                <Text style={styles.checkoutButtonText}>Checkout</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.white} />
              </TouchableOpacity>
            </View>
          )
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />

      <ConfirmModal
        visible={!!removeTarget}
        title="Remove saved booking?"
        message={removeTarget ? `Your ${removeTarget.carName} booking will no longer be held.` : ''}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          removeSavedBooking(removeTarget.id);
          setRemoveTarget(null);
        }}
        onCancel={() => setRemoveTarget(null)}
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
    header: {
      paddingTop: 60,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    headerTitle: {
      fontFamily: FONTS.bold,
      fontSize: 20,
      color: colors.textPrimary,
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: 140,
    },
    cartItem: {
      position: 'relative',
      marginBottom: 16,
    },
    removeButton: {
      position: 'absolute',
      top: 8,
      right: 8,
      backgroundColor: colors.surface,
      borderRadius: 11,
    },
    checkoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.teal,
      borderRadius: 10,
      paddingVertical: 12,
      marginTop: -4,
    },
    checkoutButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 14,
    },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      gap: 6,
    },
    title: {
      fontFamily: FONTS.bold,
      fontSize: 22,
      color: colors.textPrimary,
      marginTop: 8,
    },
    subtitle: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: 8,
    },
    browseButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.teal,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 20,
      marginTop: 8,
    },
    browseButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 14,
    },
    savedCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    savedCardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    savedCarImage: {
      width: 56,
      height: 56,
      borderRadius: 10,
    },
    savedCardInfo: {
      flex: 1,
    },
    savedCarName: {
      fontFamily: FONTS.semiBold,
      fontSize: 15,
      color: colors.textPrimary,
    },
    savedCardDates: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 2,
    },
    savedCardTotal: {
      fontFamily: FONTS.bold,
      fontSize: 18,
      color: colors.textPrimary,
      marginTop: 4,
    },
    statusBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.warningBg,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginTop: 10,
    },
    statusBadgeText: {
      fontFamily: FONTS.semiBold,
      fontSize: 11,
      color: colors.warning,
    },
    countdownRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 12,
    },
    countdownText: {
      fontFamily: FONTS.semiBold,
      fontSize: 12,
    },
    completePaymentButton: {
      backgroundColor: colors.teal,
      borderRadius: 10,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 12,
    },
    completePaymentButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 14,
    },
    expiredHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    expiredTitle: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.error,
    },
    expiredBody: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 6,
      lineHeight: 19,
    },
    searchAgainButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: 10,
      paddingVertical: 12,
      marginTop: 12,
      borderWidth: 1.5,
      borderColor: colors.teal,
    },
    searchAgainButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.teal,
      fontSize: 14,
    },
  });
}
