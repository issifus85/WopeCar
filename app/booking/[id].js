import { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, Image, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { formatCurrency, SELF_DRIVE_DELIVERY_FEE, calculateSecurityDeposit, getMinBookingDays } from '../../constants/pricing';
import { fetchCarById } from '../../services/carsApi';
import { payWithPaystack } from '../../services/paystackCheckout';
import { useBookings } from '../../contexts/BookingsContext';
import { useInbox } from '../../contexts/InboxContext';
import DateRangeModal, { formatDateShort } from '../../components/DateRangeModal';
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
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { bookings, updateBooking, cancelBooking } = useBookings();
  const { startConversation, notifyBookingEvent } = useInbox();

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

  useEffect(() => {
    if (booking?.carId) {
      fetchCarById(booking.carId).then(setCar).catch(() => setCar(null));
    }
  }, [booking?.carId]);

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
    const addons = (car.regionalAddons ?? []).filter(a => booking.addonNames?.includes(a.name));
    const addonsCost = addons.reduce((sum, a) => sum + (a.type === 'per_day' ? a.price * days : a.price), 0);
    const subtotal = rentalCost + addonsCost;
    const isSelfDrive = car.drivenBy === 'Self-drive';
    const deliveryFee = isSelfDrive ? SELF_DRIVE_DELIVERY_FEE : 0;
    const securityDeposit = calculateSecurityDeposit(subtotal);
    return subtotal + deliveryFee + securityDeposit;
  }, [car, days, booking]);

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

  const handleMessageParticipant = () => {
    if (!car) return;
    const isChauffeur = car.drivenBy === 'Chauffeur';
    const participant = {
      id: `${isChauffeur ? 'driver' : 'host'}-${car.id}`,
      name: car.owner?.name || (isChauffeur ? 'Driver' : 'Host'),
      role: isChauffeur ? 'Driver' : 'Host',
      avatar: car.owner?.avatar || null,
    };
    const conversationId = startConversation({ participant, carId: car.id, bookingId: booking.id });
    router.push(`/inbox/${conversationId}`);
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
          <Image source={{ uri: booking.carImage }} style={styles.carImage} resizeMode="cover" />
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
                <Text style={styles.messageButtonText}>
                  Message {car.drivenBy === 'Chauffeur' ? 'Driver' : 'Host'}
                </Text>
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
            <Text style={styles.rowLabel}>Pickup Location</Text>
            <Text style={styles.rowValue} numberOfLines={2}>{booking.pickupLocation}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Return Location</Text>
            <Text style={styles.rowValue} numberOfLines={2}>{booking.returnLocation}</Text>
          </View>
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
            <Text style={styles.fieldLabel}>Pickup Location</Text>
            <TextInput
              style={styles.input}
              value={editPickupLocation}
              onChangeText={handlePickupLocationChange}
              placeholder="e.g. Impact Hub, Accra"
              placeholderTextColor={colors.textSubtle}
            />
          </View>

          <TouchableOpacity style={styles.checkboxRow} onPress={toggleSameAsPickup}>
            <View style={[styles.checkbox, sameAsPickup && styles.checkboxChecked]}>
              {sameAsPickup && <Ionicons name="checkmark" size={14} color={colors.white} />}
            </View>
            <Text style={styles.checkboxLabel}>Return to the same location</Text>
          </TouchableOpacity>

          {!sameAsPickup && (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Return Location</Text>
              <TextInput
                style={styles.input}
                value={editReturnLocation}
                onChangeText={setEditReturnLocation}
                placeholder="e.g. Kotoka Airport, Accra"
                placeholderTextColor={colors.textSubtle}
              />
            </View>
          )}

          {!!car && days > 0 && (
            <View style={styles.recomputedBox}>
              <Text style={styles.recomputedLabel}>New total for {days} {days === 1 ? 'day' : 'days'}</Text>
              <Text style={styles.recomputedValue}>{formatCurrency(recomputedTotal)}</Text>
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
              <Text style={styles.rowLabel}>Pickup Location</Text>
              <Text style={styles.rowValue} numberOfLines={2}>{editPickupLocation}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Return Location</Text>
              <Text style={styles.rowValue} numberOfLines={2}>{editReturnLocation}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Cost Summary</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Original Total ({originalDays} {originalDays === 1 ? 'day' : 'days'})</Text>
              <Text style={styles.rowValue}>{formatCurrency(booking.totalCost)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>New Total ({days} {days === 1 ? 'day' : 'days'})</Text>
              <Text style={styles.rowValue}>{formatCurrency(recomputedTotal)}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <Text style={styles.totalLabel}>
                {difference > 0 ? 'Amount Due' : difference < 0 ? 'Difference (Credit)' : 'Amount Due'}
              </Text>
              <Text style={styles.totalValue}>{formatCurrency(Math.abs(difference))}</Text>
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
            <Text style={styles.totalValue}>{formatCurrency(booking.totalCost)}</Text>
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
                    {difference > 0 ? `Pay ${formatCurrency(difference)}` : 'Confirm Changes'}
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
  input: {
    fontFamily: FONTS.regular,
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
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
