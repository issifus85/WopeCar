import { useState, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useSettings } from '../../contexts/SettingsContext';
import {
  formatCurrency,
  getSelfDriveDeliveryFee,
  calculateSecurityDeposit,
  calculateRentalPricing,
  getMinBookingDays,
  WOPECARE_PLANS,
  calculateWopeCareCost,
} from '../../constants/pricing';
import { fetchCarById } from '../../services/carsApi';
import { getDatePriceMap } from '../../services/carPricingApi';
import { payWithPaystack } from '../../services/paystackCheckout';
import { openDirections } from '../../services/mapsLauncher';
import { getInspection } from '../../services/inspectionsApi';
import { getRentalAgreement } from '../../services/rentalAgreementApi';
import { getMyReviewForBooking } from '../../services/reviewsApi';
import { useBookings } from '../../contexts/BookingsContext';
import { useInbox } from '../../contexts/InboxContext';
import DateRangeModal, { formatDateShort } from '../../components/DateRangeModal';
import LocationSearchModal from '../../components/LocationSearchModal';
import ConfirmModal from '../../components/ConfirmModal';

function getStatusColors(colors) {
  return {
    Pending: { bg: colors.warningBg, text: colors.warning },
    Confirmed: { bg: colors.successBg, text: colors.success },
    Completed: { bg: colors.successBg, text: colors.success },
    Cancelled: { bg: colors.errorBg, text: colors.error },
  };
}

const TIME_SLOTS = [
  '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM',
];

function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// inspection is undefined while its GET is still in flight, null once
// confirmed there's genuinely no draft/report yet - see the useFocusEffect
// in BookingDetailScreen.
function inspectionStatusLabel(inspection) {
  if (inspection === undefined) return '...';
  if (!inspection) return 'Not Started';
  return inspection.status === 'submitted' ? 'View Report' : 'Resume Draft';
}

function inspectionStatusStyle(inspection, colors) {
  if (!inspection || inspection === undefined) return null;
  return { color: inspection.status === 'submitted' ? colors.teal : colors.warning };
}

// Same undefined/null/object convention as inspectionStatusLabel above.
function agreementStatusLabel(agreement) {
  if (agreement === undefined) return '...';
  if (!agreement) return 'Not Started';
  return agreement.status === 'submitted' ? 'View Agreement' : 'Resume Draft';
}

function agreementStatusStyle(agreement, colors) {
  if (!agreement || agreement === undefined) return null;
  return { color: agreement.status === 'submitted' ? colors.teal : colors.warning };
}

function daysBetween(start, end) {
  if (!start || !end) return 0;
  const diff = new Date(end) - new Date(start);
  return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
}

function toISODate(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function TimeSlotPicker({ label, value, onChange, styles }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.slotGrid}>
        {TIME_SLOTS.map((slot) => (
          <TouchableOpacity
            key={slot}
            style={[styles.slot, value === slot && styles.slotActive]}
            onPress={() => onChange(slot)}
          >
            <Text style={[styles.slotText, value === slot && styles.slotTextActive]}>{slot}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function BookingDetailScreen() {
  const { id, from } = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useAppTheme();
  const { activeCurrency } = useCurrency();
  const { settings } = useSettings();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { bookings, updateBooking, cancelBooking } = useBookings();
  const { conversations, notifyBookingEvent } = useInbox();

  // A custom headerLeft, not just the default native-stack back button -
  // that default dispatches a bare GO_BACK action, which React Navigation's
  // web implementation can fail to resolve for this exact screen
  // (booking/[id] is a root-level Stack.Screen pushed from inside the
  // (tabs) group's own nested navigator; on web that combination can leave
  // GO_BACK with "no screen to go back to" even though a real previous
  // screen is visible - reproduced live, logging "The action 'GO_BACK' was
  // not handled by any navigator" in dev while the tap did nothing).
  // Sidesteps back()/canGoBack() entirely (canGoBack() reports true even in
  // the broken state, so that fallback still calls the same broken back())
  // and always replaces to a known-good destination instead - same
  // "explicit target beats an unreliable back()" call app/login.js already
  // makes for its own post-auth navigation.
  const handleBack = useCallback(() => {
    router.replace(from === 'inbox' ? '/(tabs)' : '/(tabs)/bookings');
  }, [router, from]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={handleBack} hitSlop={10} style={styles.headerBackButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          <Text style={styles.headerBackLabel}>{from === 'inbox' ? 'Inbox' : 'Bookings'}</Text>
        </TouchableOpacity>
      ),
    });
  }, [from, navigation, handleBack, styles, colors]);

  const booking = bookings.find(b => b.id === id);

  const [car, setCar] = useState(null);
  // 'view' | 'editing' | 'reviewing'
  const [mode, setMode] = useState('view');
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [isCancelModalVisible, setIsCancelModalVisible] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState(null);

  const [editStart, setEditStart] = useState(null);
  const [editEnd, setEditEnd] = useState(null);
  const [editPickupTime, setEditPickupTime] = useState(null);
  const [editReturnTime, setEditReturnTime] = useState(null);
  const [editPickupLocation, setEditPickupLocation] = useState('');
  const [editReturnLocation, setEditReturnLocation] = useState('');
  const [sameAsPickup, setSameAsPickup] = useState(false);
  const [isPickupModalVisible, setIsPickupModalVisible] = useState(false);
  const [isReturnModalVisible, setIsReturnModalVisible] = useState(false);
  // Dismissed for this screen visit only - not persisted, so the prompt is
  // free to reappear next time the booking is opened on pickup day.
  const [directionsPromptDismissed, setDirectionsPromptDismissed] = useState(false);

  useEffect(() => {
    if (booking?.carId) {
      fetchCarById(booking.carId).then(setCar).catch(() => setCar(null));
    }
  }, [booking?.carId]);

  // undefined = still loading, null = not started yet. Both inspections and
  // rental agreements are Supabase-native now - keyed on booking.id
  // directly (a Supabase booking has one real id, no more local-vs-server
  // distinction to bridge). Re-fetched on focus so returning from either
  // wizard picks up whatever was just saved.
  const [preInspection, setPreInspection] = useState(undefined);
  const [postInspection, setPostInspection] = useState(undefined);
  const [rentalAgreement, setRentalAgreement] = useState(undefined);
  const [myReview, setMyReview] = useState(undefined);

  useFocusEffect(useCallback(() => {
    if (!booking?.id) {
      setPreInspection(null);
      setPostInspection(null);
      setRentalAgreement(null);
      setMyReview(null);
      return;
    }
    getInspection(booking.id, 'pre').then(setPreInspection).catch(() => setPreInspection(null));
    getInspection(booking.id, 'post').then(setPostInspection).catch(() => setPostInspection(null));
    getRentalAgreement(booking.id).then(setRentalAgreement).catch(() => setRentalAgreement(null));
    if (booking.status === 'Completed') {
      getMyReviewForBooking(booking.id).then(setMyReview).catch(() => setMyReview(null));
    }
  }, [booking?.id, booking?.status]));

  const handleInspectionPress = (type, inspection) => {
    if (inspection?.status === 'submitted') {
      router.push({ pathname: '/inspection/report', params: { bookingId: booking.id, type } });
      return;
    }
    router.push({ pathname: '/inspection/mileage', params: { bookingId: booking.id, localId: booking.id, type } });
  };

  const handleRentalAgreementPress = () => {
    if (rentalAgreement?.status === 'submitted') {
      router.push({ pathname: '/rental-agreement/report', params: { bookingId: booking.id } });
      return;
    }
    router.push({ pathname: '/rental-agreement/[bookingId]', params: { bookingId: booking.id, localId: booking.id } });
  };

  const startEditing = () => {
    setEditStart(booking.startDate ? new Date(booking.startDate) : null);
    setEditEnd(booking.endDate ? new Date(booking.endDate) : null);
    setEditPickupTime(booking.pickupTime);
    setEditReturnTime(booking.returnTime);
    setEditPickupLocation(booking.pickupLocation ?? '');
    setEditReturnLocation(booking.returnLocation ?? '');
    setSameAsPickup(!!booking.pickupLocation && booking.pickupLocation === booking.returnLocation);
    setPaymentError(null);
    setMode('editing');
  };

  const originalDays = useMemo(
    () => daysBetween(booking?.startDate, booking?.endDate),
    [booking?.startDate, booking?.endDate]
  );

  // Per-date custom pricing for just the (possibly just-edited) trip range -
  // falls back to the car's base price_per_day for any date without an
  // override, same as checkout/summary.js and checkout/payment.js.
  const [datePriceMap, setDatePriceMap] = useState({});
  useEffect(() => {
    if (!car?.id || !editStart || !editEnd) return;
    getDatePriceMap(car.id, { fromDate: toISODate(editStart), toDate: toISODate(editEnd) })
      .then(setDatePriceMap)
      .catch(() => {});
  }, [car?.id, editStart, editEnd]);

  const pricing = useMemo(() => {
    if (!car || !editStart || !editEnd || !editPickupTime || !editReturnTime) return null;
    return calculateRentalPricing({
      startDate: editStart,
      endDate: editEnd,
      pickupTime: editPickupTime,
      returnTime: editReturnTime,
      drivenBy: car.drivenBy,
      dailyRate: car.pricePerDay,
      getDatePrice: (iso) => datePriceMap[iso],
      lengthOfStayDiscounts: car.lengthOfStayDiscounts,
      discount: car.discount,
    });
  }, [car, editStart, editEnd, editPickupTime, editReturnTime, datePriceMap]);

  const days = pricing?.billableDays ?? 0;

  // Live-recalculated the same way rentalCost/addonsCost/etc. already are
  // below - driven by the edited `days`, never trusting the stale total
  // captured back at checkout. dailyRate/coverage don't change (still the
  // same plan on the same car), only the trip-length-dependent total does.
  const recomputedWopeCareCost = useMemo(() => {
    const plan = booking?.wopeCare?.plan;
    if (!car || !days || !plan || plan === 'none') return 0;
    return calculateWopeCareCost(car.pricePerDay, plan, days);
  }, [car, days, booking?.wopeCare?.plan]);

  const recomputedTotal = useMemo(() => {
    if (!car || !pricing || !days) return booking?.totalCost ?? 0;
    const rentalCost = pricing.rentalCost;
    // booking.addons ({name, days}[]) is the current shape; bookings made
    // before per-addon day counts existed only have booking.addonNames
    // (string[]) with no day count of their own - fall back to the
    // original trip length for those, matching the old behavior exactly.
    const addonSelections = booking.addons
      ?? (booking.addonNames ?? []).map((name) => ({ name, days: originalDays }));
    const addons = (car.regionalAddons ?? [])
      .map((addon) => {
        const selection = addonSelections.find((a) => a.name === addon.name);
        if (!selection) return null;
        // An addon can never apply to more days than the (possibly just
        // edited) trip itself now lasts.
        return { ...addon, days: Math.min(selection.days, days) };
      })
      .filter(Boolean);
    const addonsCost = addons.reduce((sum, a) => sum + (a.type === 'per_day' ? a.price * a.days : a.price), 0);
    const subtotal = rentalCost + addonsCost;
    const isSelfDrive = car.drivenBy === 'Self-drive';
    const deliveryFee = isSelfDrive ? getSelfDriveDeliveryFee() : 0;
    const securityDeposit = calculateSecurityDeposit(subtotal);
    return subtotal + deliveryFee + securityDeposit + recomputedWopeCareCost;
  }, [car, pricing, days, booking, originalDays, recomputedWopeCareCost]);

  const difference = recomputedTotal - (booking?.totalCost ?? 0);

  const minDays = car ? getMinBookingDays(car.drivenBy) : 1;
  const isBelowMinimum = editStart && editEnd && days < minDays;

  const handlePickupLocationChange = (text) => {
    setEditPickupLocation(text);
    if (sameAsPickup) setEditReturnLocation(text);
  };

  const toggleSameAsPickup = () => {
    const next = !sameAsPickup;
    setSameAsPickup(next);
    if (next) setEditReturnLocation(editPickupLocation);
  };

  const isEditValid = editStart && editEnd && editPickupTime && editReturnTime
    && editPickupLocation.trim() && editReturnLocation.trim() && !isBelowMinimum;

  const buildUpdatedFields = (extra = {}) => ({
    startDate: editStart.toISOString(),
    endDate: editEnd.toISOString(),
    pickupTime: editPickupTime,
    returnTime: editReturnTime,
    pickupLocation: editPickupLocation,
    returnLocation: editReturnLocation,
    totalCost: recomputedTotal,
    wopeCare: booking.wopeCare?.plan && booking.wopeCare.plan !== 'none'
      ? { ...booking.wopeCare, totalCost: recomputedWopeCareCost }
      : booking.wopeCare,
    ...extra,
  });

  const handleConfirmNoPayment = () => {
    updateBooking(booking.id, buildUpdatedFields());
    notifyBookingEvent('booking_modified', booking);
    setMode('view');
  };

  const handlePayDifference = async () => {
    setIsProcessingPayment(true);
    setPaymentError(null);
    try {
      const reference = await payWithPaystack(difference);
      updateBooking(booking.id, buildUpdatedFields({ paystackReference: reference }));
      notifyBookingEvent('booking_modified', booking);
      setMode('view');
    } catch (e) {
      setPaymentError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleConfirmCancel = async () => {
    setIsCancelModalVisible(false);
    try {
      // Awaited (not fire-and-forget) so a rejected Supabase update - e.g.
      // RLS/network - never leaves the UI showing "Cancelled" for a booking
      // that, in reality, wasn't.
      await cancelBooking(booking.id);
      notifyBookingEvent('booking_cancelled', booking);
    } catch (e) {
      Alert.alert('Could not cancel booking', e.message || 'Please try again.');
    }
  };

  // Hosts are never directly messageable (see InboxContext.js) - this
  // opens the real, booking-anchored conversation with WopeCar Support
  // instead, created server-side (a Postgres trigger) when the booking was
  // made. Keyed on booking.id directly, not a separate serverId - bookings
  // are Supabase-native now, so a booking's own id IS the real id a
  // conversation's booking_id refers to; there's no more local-vs-server
  // indirection to bridge.
  const handleMessageParticipant = () => {
    const serverConversation = conversations.find(
      (c) => c.source === 'server' && c.bookingId === booking.id
    );
    if (!serverConversation) {
      Alert.alert('Messaging unavailable', "Messaging isn't available for this booking yet.");
      return;
    }
    router.push(`/inbox/${serverConversation.id}`);
  };

  if (!booking) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.notFoundText}>Booking not found.</Text>
      </View>
    );
  }

  const statusColors = getStatusColors(colors);
  const statusStyle = statusColors[booking.status] ?? statusColors.Pending;
  // A finished trip can't be cancelled or modified - this used to be
  // impossible to express (completed bookings showed as 'Confirmed', see
  // BookingsContext's STATUS_MAP), so this exclusion is new alongside that
  // fix, not a behavior change on top of already-correct logic.
  const canModify = booking.status !== 'Cancelled' && booking.status !== 'Completed';

  // "Today" per calendar date, not exact time - a booking whose pickup is
  // today should prompt regardless of what time pickup is scheduled for.
  const isPickupToday = booking.startDate
    && new Date(booking.startDate).toDateString() === new Date().toDateString();
  const showDirectionsPrompt = mode === 'view' && settings.autoOpenDirections && isPickupToday
    && booking.status === 'Confirmed' && !!booking.pickupLocation && !directionsPromptDismissed;

  const handleDirectionsPromptPress = () => {
    openDirections(booking.pickupLocation, settings.mapProvider);
    setDirectionsPromptDismissed(true);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.headerCard}>
        {booking.carImage ? (
          <Image source={{ uri: booking.carImage }} style={styles.carImage} contentFit="cover" />
        ) : (
          <View style={[styles.carImage, styles.imagePlaceholder]}>
            <Text style={styles.imagePlaceholderText}>🚗</Text>
          </View>
        )}
        <View style={styles.headerInfo}>
          <Text style={styles.carName}>{booking.carName}</Text>
          <View style={styles.headerBadgeRow}>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusText, { color: statusStyle.text }]}>{booking.status}</Text>
            </View>
            {!!car && (
              <TouchableOpacity style={styles.messageButton} onPress={handleMessageParticipant}>
                <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.teal} />
                <Text style={styles.messageButtonText}>Message Support</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {showDirectionsPrompt && (
        <View style={styles.directionsPromptCard}>
          <Ionicons name="navigate-circle-outline" size={24} color={colors.teal} />
          <View style={styles.directionsPromptTextWrap}>
            <Text style={styles.directionsPromptTitle}>Today's your pickup day</Text>
            <Text style={styles.directionsPromptBody} numberOfLines={1}>Directions to {booking.pickupLocation}</Text>
          </View>
          <TouchableOpacity style={styles.directionsPromptButton} onPress={handleDirectionsPromptPress}>
            <Text style={styles.directionsPromptButtonText}>Go</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setDirectionsPromptDismissed(true)} hitSlop={8}>
            <Ionicons name="close" size={18} color={colors.textSubtle} />
          </TouchableOpacity>
        </View>
      )}

      {mode === 'view' && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Trip Details</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Pickup</Text>
            <Text style={styles.rowValue}>{formatDate(booking.startDate)} · {booking.pickupTime}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Return</Text>
            <Text style={styles.rowValue}>{formatDate(booking.endDate)} · {booking.returnTime}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Vehicle Delivery Location</Text>
            <View style={styles.rowValueWithAction}>
              <Text style={styles.rowValue} numberOfLines={2}>{booking.pickupLocation}</Text>
              {!!booking.pickupLocation && (
                <TouchableOpacity
                  onPress={() => openDirections(booking.pickupLocation, settings.mapProvider)}
                  hitSlop={8}
                  style={styles.directionsButton}
                >
                  <Ionicons name="navigate-outline" size={16} color={colors.teal} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Vehicle Pickup Location</Text>
            <View style={styles.rowValueWithAction}>
              <Text style={styles.rowValue} numberOfLines={2}>{booking.returnLocation}</Text>
              {!!booking.returnLocation && (
                <TouchableOpacity
                  onPress={() => openDirections(booking.returnLocation, settings.mapProvider)}
                  hitSlop={8}
                  style={styles.directionsButton}
                >
                  <Ionicons name="navigate-outline" size={16} color={colors.teal} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      )}

      {mode === 'view' && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Vehicle Inspection</Text>
          <TouchableOpacity style={styles.row} onPress={() => handleInspectionPress('pre', preInspection)}>
            <Text style={styles.rowLabel}>Pre-Rental Inspection</Text>
            <View style={styles.rowValueWithAction}>
              <Text style={[styles.rowValue, inspectionStatusStyle(preInspection, colors)]}>
                {inspectionStatusLabel(preInspection)}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, styles.rowLast]}
            onPress={() => handleInspectionPress('post', postInspection)}
            disabled={preInspection?.status !== 'submitted'}
          >
            <Text style={styles.rowLabel}>Post-Rental Inspection</Text>
            <View style={styles.rowValueWithAction}>
              <Text style={[styles.rowValue, inspectionStatusStyle(postInspection, colors)]}>
                {preInspection?.status !== 'submitted' ? 'Locked' : inspectionStatusLabel(postInspection)}
              </Text>
              {preInspection?.status === 'submitted' && (
                <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
              )}
            </View>
          </TouchableOpacity>
        </View>
      )}

      {mode === 'view' && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Rental Agreement</Text>
          <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={handleRentalAgreementPress}>
            <Text style={styles.rowLabel}>Client Rental Agreement</Text>
            <View style={styles.rowValueWithAction}>
              <Text style={[styles.rowValue, agreementStatusStyle(rentalAgreement, colors)]}>
                {agreementStatusLabel(rentalAgreement)}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {mode === 'editing' && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Modify Trip Details</Text>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Dates</Text>
            <TouchableOpacity style={styles.dateButton} onPress={() => setIsDatePickerVisible(true)}>
              <Ionicons name="calendar-outline" size={16} color={colors.teal} />
              <Text style={styles.dateButtonText}>
                {editStart && editEnd
                  ? `${formatDateShort(editStart)} — ${formatDateShort(editEnd)}`
                  : 'Select dates'}
              </Text>
            </TouchableOpacity>
            {isBelowMinimum && (
              <Text style={styles.warningText}>
                {car.drivenBy} bookings need at least {minDays} {minDays === 1 ? 'day' : 'days'} - you've selected {days}.
              </Text>
            )}
          </View>

          <TimeSlotPicker label="Pickup Time" value={editPickupTime} onChange={setEditPickupTime} styles={styles} />
          <TimeSlotPicker label="Return Time" value={editReturnTime} onChange={setEditReturnTime} styles={styles} />

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Vehicle Delivery Location</Text>
            <TouchableOpacity style={styles.locationPill} onPress={() => setIsPickupModalVisible(true)}>
              <Ionicons name="location-outline" size={18} color={colors.teal} />
              <Text style={[styles.locationPillText, !editPickupLocation && styles.locationPillPlaceholder]} numberOfLines={1}>
                {editPickupLocation || 'Search for a vehicle delivery location...'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.checkboxRow} onPress={toggleSameAsPickup}>
            <View style={[styles.checkbox, sameAsPickup && styles.checkboxChecked]}>
              {sameAsPickup && <Ionicons name="checkmark" size={14} color={colors.white} />}
            </View>
            <Text style={styles.checkboxLabel}>Return to the same location</Text>
          </TouchableOpacity>

          {!sameAsPickup && (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Vehicle Pickup Location</Text>
              <TouchableOpacity style={styles.locationPill} onPress={() => setIsReturnModalVisible(true)}>
                <Ionicons name="location-outline" size={18} color={colors.teal} />
                <Text style={[styles.locationPillText, !editReturnLocation && styles.locationPillPlaceholder]} numberOfLines={1}>
                  {editReturnLocation || 'Search for a vehicle pickup location...'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {!!car && days > 0 && (
            <View style={styles.recomputedBox}>
              <Text style={styles.recomputedLabel}>New total for {days} {days === 1 ? 'day' : 'days'}</Text>
              <Text style={styles.recomputedValue}>{formatCurrency(recomputedTotal, activeCurrency)}</Text>
            </View>
          )}
        </View>
      )}

      {mode === 'reviewing' && (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>New Trip Details</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Pickup</Text>
              <Text style={styles.rowValue}>{formatDate(editStart)} · {editPickupTime}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Return</Text>
              <Text style={styles.rowValue}>{formatDate(editEnd)} · {editReturnTime}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Vehicle Delivery Location</Text>
              <Text style={styles.rowValue} numberOfLines={2}>{editPickupLocation}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Vehicle Pickup Location</Text>
              <Text style={styles.rowValue} numberOfLines={2}>{editReturnLocation}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Cost Summary</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Original Total ({originalDays} {originalDays === 1 ? 'day' : 'days'})</Text>
              <Text style={styles.rowValue}>{formatCurrency(booking.totalCost, activeCurrency)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>New Total ({days} {days === 1 ? 'day' : 'days'})</Text>
              <Text style={styles.rowValue}>{formatCurrency(recomputedTotal, activeCurrency)}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <Text style={styles.totalLabel}>
                {difference > 0 ? 'Amount Due' : difference < 0 ? 'Difference (Credit)' : 'Amount Due'}
              </Text>
              <Text style={styles.totalValue}>{formatCurrency(Math.abs(difference), activeCurrency)}</Text>
            </View>

            {difference <= 0 && (
              <Text style={styles.noPaymentNote}>
                {difference < 0
                  ? 'This change lowers your total. No additional payment is required - please contact support about a refund for the difference.'
                  : 'No additional payment is required for this change.'}
              </Text>
            )}

            {isProcessingPayment && (
              <View style={styles.processingBox}>
                <ActivityIndicator size="small" color={colors.teal} />
                <Text style={styles.processingText}>Processing payment...</Text>
              </View>
            )}

            {!!paymentError && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
                <Text style={styles.errorText}>{paymentError}</Text>
              </View>
            )}
          </View>
        </>
      )}

      {mode === 'view' && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>WopeCare Protection</Text>
          {booking.wopeCare?.plan && booking.wopeCare.plan !== 'none' ? (
            <>
              <View style={styles.row}>
                <View style={styles.wopeCareTitleRow}>
                  <Ionicons name="shield-checkmark" size={16} color={colors.success} />
                  <Text style={styles.rowLabel}>{WOPECARE_PLANS[booking.wopeCare.plan]?.name ?? 'WopeCare'}</Text>
                </View>
                <Text style={styles.rowValue}>{formatCurrency(booking.wopeCare.totalCost, activeCurrency)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Coverage</Text>
                <Text style={styles.rowValue}>Up to {formatCurrency(booking.wopeCare.coverage, activeCurrency)}</Text>
              </View>
              <View style={[styles.row, styles.rowLast]}>
                <Text style={styles.rowLabel}>Daily Rate</Text>
                <Text style={styles.rowValue}>{formatCurrency(booking.wopeCare.dailyRate, activeCurrency)}/day</Text>
              </View>
            </>
          ) : (
            <View style={[styles.row, styles.rowLast]}>
              <View style={styles.wopeCareTitleRow}>
                <Ionicons name="warning" size={16} color={colors.warning} />
                <Text style={styles.rowLabel}>No WopeCare Protection</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {mode === 'view' && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Payment</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Total Paid</Text>
            <Text style={styles.totalValue}>{formatCurrency(booking.totalCost, activeCurrency)}</Text>
          </View>
          {!!booking.paystackReference && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Reference</Text>
              <Text style={styles.rowValue}>{booking.paystackReference}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Booked On</Text>
            <Text style={styles.rowValue}>{formatDate(booking.createdAt)}</Text>
          </View>
        </View>
      )}

      {mode === 'view' && booking.status === 'Completed' && myReview !== undefined && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push({ pathname: '/review/[bookingId]', params: { bookingId: booking.id } })}
          >
            <Text style={styles.primaryButtonText}>{myReview ? 'Edit Your Review' : 'Rate Your Trip'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {canModify && (
        <View style={styles.actions}>
          {mode === 'editing' && (
            <>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setMode('view')}>
                <Text style={styles.secondaryButtonText}>Discard Changes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, !isEditValid && styles.primaryButtonDisabled]}
                onPress={() => setMode('reviewing')}
                disabled={!isEditValid}
              >
                <Text style={styles.primaryButtonText}>Review Changes</Text>
              </TouchableOpacity>
            </>
          )}

          {mode === 'reviewing' && (
            <>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setMode('editing')}
                disabled={isProcessingPayment}
              >
                <Text style={styles.secondaryButtonText}>Back to Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={difference > 0 ? handlePayDifference : handleConfirmNoPayment}
                disabled={isProcessingPayment}
              >
                {isProcessingPayment ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {difference > 0 ? `Pay ${formatCurrency(difference, activeCurrency)}` : 'Confirm Changes'}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {mode === 'view' && (
            <>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setIsCancelModalVisible(true)}>
                <Text style={styles.secondaryButtonTextDanger}>Cancel Booking</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={startEditing}>
                <Text style={styles.primaryButtonText}>Modify Booking</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      <DateRangeModal
        visible={isDatePickerVisible}
        onClose={() => setIsDatePickerVisible(false)}
        startDate={editStart}
        endDate={editEnd}
        onApply={(start, end) => {
          setEditStart(start);
          setEditEnd(end);
        }}
      />

      <ConfirmModal
        visible={isCancelModalVisible}
        title="Cancel Booking"
        message="Are you sure you want to cancel this booking? This cannot be undone."
        confirmLabel="Cancel Booking"
        cancelLabel="Keep Booking"
        destructive
        onConfirm={handleConfirmCancel}
        onCancel={() => setIsCancelModalVisible(false)}
      />

      <LocationSearchModal
        visible={isPickupModalVisible}
        onClose={() => setIsPickupModalVisible(false)}
        title="Vehicle Delivery Location"
        onSelect={handlePickupLocationChange}
      />
      <LocationSearchModal
        visible={isReturnModalVisible}
        onClose={() => setIsReturnModalVisible(false)}
        title="Vehicle Pickup Location"
        onSelect={setEditReturnLocation}
      />
    </ScrollView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
  headerBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  headerBackLabel: {
    fontFamily: FONTS.regular,
    fontSize: 17,
    color: colors.textPrimary,
    marginLeft: -4,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundText: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: colors.textMuted,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  carImage: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  imagePlaceholder: {
    backgroundColor: colors.highlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: {
    fontSize: 28,
  },
  headerInfo: {
    flex: 1,
    gap: 8,
  },
  carName: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  headerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontFamily: FONTS.semiBold,
    fontSize: 11,
  },
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.highlight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  messageButtonText: {
    fontFamily: FONTS.semiBold,
    fontSize: 11,
    color: colors.teal,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  directionsPromptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.highlight,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  directionsPromptTextWrap: {
    flex: 1,
  },
  directionsPromptTitle: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  directionsPromptBody: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: colors.textSubtle,
    marginTop: 1,
  },
  directionsPromptButton: {
    backgroundColor: colors.teal,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  directionsPromptButtonText: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: colors.white,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  rowLabel: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: colors.textSubtle,
    flexShrink: 1,
  },
  rowValue: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
  rowValueWithAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    justifyContent: 'flex-end',
  },
  wopeCareTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  directionsButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.highlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalValue: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  totalLabel: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  noPaymentNote: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: colors.textSubtle,
    lineHeight: 17,
    marginTop: 4,
  },
  processingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.highlight,
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
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
    marginTop: 12,
  },
  errorText: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: colors.error,
  },
  field: {
    marginBottom: 18,
  },
  fieldLabel: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateButtonText: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: colors.textPrimary,
  },
  warningText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: colors.error,
    marginTop: 6,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slot: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  slotActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  slotText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
  slotTextActive: {
    fontFamily: FONTS.semiBold,
    color: colors.white,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locationPillText: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: colors.textPrimary,
  },
  locationPillPlaceholder: {
    color: colors.textSubtle,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
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
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: colors.textPrimary,
  },
  recomputedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.highlight,
    borderRadius: 10,
    padding: 14,
  },
  recomputedLabel: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  recomputedValue: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.teal,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  primaryButtonText: {
    fontFamily: FONTS.semiBold,
    color: colors.white,
    fontSize: 15,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    fontFamily: FONTS.semiBold,
    color: colors.textMuted,
    fontSize: 15,
  },
  secondaryButtonTextDanger: {
    fontFamily: FONTS.semiBold,
    color: colors.error,
    fontSize: 15,
  },
  });
}
