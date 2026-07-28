import { useState, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useSettings } from '../../contexts/SettingsContext';
import { formatCurrency, SELF_DRIVE_DELIVERY_FEE, calculateSecurityDeposit, getMinBookingDays } from '../../constants/pricing';
import { fetchCarById } from '../../services/carsApi';
import { payWithPaystack } from '../../services/paystackCheckout';
import { openDirections } from '../../services/mapsLauncher';
import { getInspection } from '../../services/inspectionsApi';
import { getRentalAgreement } from '../../services/rentalAgreementApi';
import { useBookings } from '../../contexts/BookingsContext';
import { useInbox } from '../../contexts/InboxContext';
import DateRangeModal, { formatDateShort } from '../../components/DateRangeModal';
import LocationSearchModal from '../../components/LocationSearchModal';
import ConfirmModal from '../../components/ConfirmModal';

function getStatusColors(colors) {
  return {
    Pending: { bg: colors.warningBg, text: colors.warning },
    Confirmed: { bg: colors.successBg, text: colors.success },
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

  // Static headerBackTitle in _layout.js says "Bookings" (the common path,
  // reached from the Bookings tab list) - override it here for the other
  // entry point, a notification tap from the Inbox hub, so the back button
  // label matches where it actually goes.
  useLayoutEffect(() => {
    if (from === 'inbox') {
      navigation.setOptions({ headerBackTitle: 'Inbox' });
    }
  }, [from, navigation]);

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

  useEffect(() => {
    if (booking?.carId) {
      fetchCarById(booking.carId).then(setCar).catch(() => setCar(null));
    }
  }, [booking?.carId]);

  // undefined = still loading, null = no inspection started yet. Keyed off
  // booking.serverId (the real server booking id) rather than booking.id
  // (the local id) - inspections live server-side, same constraint as
  // messaging's serverConversation lookup above. Re-fetched on focus so
  // returning from the wizard picks up whatever was just saved.
  const [preInspection, setPreInspection] = useState(undefined);
  const [postInspection, setPostInspection] = useState(undefined);
  const [rentalAgreement, setRentalAgreement] = useState(undefined);

  useFocusEffect(useCallback(() => {
    if (!booking?.serverId) {
      setPreInspection(null);
      setPostInspection(null);
      setRentalAgreement(null);
      return;
    }
    getInspection(booking.serverId, 'pre').then(setPreInspection).catch(() => setPreInspection(null));
    getInspection(booking.serverId, 'post').then(setPostInspection).catch(() => setPostInspection(null));
    getRentalAgreement(booking.serverId).then(setRentalAgreement).catch(() => setRentalAgreement(null));
  }, [booking?.serverId]));

  const handleInspectionPress = (type, inspection) => {
    if (!booking.serverId) {
      Alert.alert('Not available yet', "Vehicle inspection isn't available for this booking yet.");
      return;
    }
    if (inspection?.status === 'submitted' && inspection.document) {
      Linking.openURL(inspection.document.signedUrl);
      return;
    }
    // localId is the app's own booking.id (used to navigate back to this
    // exact screen when the wizard finishes) - distinct from bookingId
    // (booking.serverId), which is what the inspection API itself is keyed
    // on. The two are unrelated strings/ids, never interchangeable.
    router.push({ pathname: '/inspection/mileage', params: { bookingId: booking.serverId, localId: booking.id, type } });
  };

  const handleRentalAgreementPress = () => {
    if (!booking.serverId) {
      Alert.alert('Not available yet', "The rental agreement isn't available for this booking yet.");
      return;
    }
    if (rentalAgreement?.status === 'submitted' && rentalAgreement.document) {
      Linking.openURL(rentalAgreement.document.signedUrl);
      return;
    }
    router.push({ pathname: '/rental-agreement/[bookingId]', params: { bookingId: booking.serverId, localId: booking.id } });
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

  const days = useMemo(() => daysBetween(editStart, editEnd), [editStart, editEnd]);
  const originalDays = useMemo(
    () => daysBetween(booking?.startDate, booking?.endDate),
    [booking?.startDate, booking?.endDate]
  );

  const recomputedTotal = useMemo(() => {
    if (!car || !days) return booking?.totalCost ?? 0;
    const rentalCost = (car.pricePerDay ?? 0) * days;
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
    const deliveryFee = isSelfDrive ? SELF_DRIVE_DELIVERY_FEE : 0;
    const securityDeposit = calculateSecurityDeposit(subtotal);
    return subtotal + deliveryFee + securityDeposit;
  }, [car, days, booking, originalDays]);

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

  const handleConfirmCancel = () => {
    cancelBooking(booking.id);
    notifyBookingEvent('booking_cancelled', booking);
    setIsCancelModalVisible(false);
  };

  // Hosts are never directly messageable (see InboxContext.js) - this
  // opens the real, booking-anchored conversation with WopeCar Support
  // instead, created server-side when the booking was made. Falls back
  // gracefully if that best-effort server booking call never succeeded.
  const handleMessageParticipant = () => {
    const serverConversation = conversations.find(
      (c) => c.source === 'server' && c.bookingId === booking.serverId
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
  const canModify = booking.status !== 'Cancelled';

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
    color: colors.teal,
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
    color: colors.teal,
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
