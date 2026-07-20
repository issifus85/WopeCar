import { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, Image, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../constants/theme';
import { formatCurrency, SELF_DRIVE_DELIVERY_FEE, calculateSecurityDeposit } from '../../constants/pricing';
import { fetchCarById } from '../../services/carsApi';
import { useBookings } from '../../contexts/BookingsContext';
import DateRangeModal, { formatDateShort } from '../../components/DateRangeModal';
import ConfirmModal from '../../components/ConfirmModal';

const STATUS_COLORS = {
  Pending: { bg: '#FFF3E0', text: '#E65100' },
  Confirmed: { bg: '#E8F5E9', text: '#2E7D32' },
  Cancelled: { bg: '#FFEBEE', text: '#C62828' },
};

const TIME_SLOTS = [
  '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
];

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function TimeSlotPicker({ label, value, onChange }) {
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
  const { bookings, updateBooking, cancelBooking } = useBookings();

  const booking = bookings.find(b => b.id === id);

  const [car, setCar] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [isCancelModalVisible, setIsCancelModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
    setIsEditing(true);
  };

  const nights = useMemo(() => {
    if (!editStart || !editEnd) return 0;
    const diff = new Date(editEnd) - new Date(editStart);
    return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
  }, [editStart, editEnd]);

  const recomputedTotal = useMemo(() => {
    if (!car || !nights) return booking?.totalCost ?? 0;
    const rentalCost = (car.pricePerDay ?? 0) * nights;
    const addons = (car.regionalAddons ?? []).filter(a => booking.addonNames?.includes(a.name));
    const addonsCost = addons.reduce((sum, a) => sum + (a.type === 'per_day' ? a.price * nights : a.price), 0);
    const subtotal = rentalCost + addonsCost;
    const isSelfDrive = car.drivenBy === 'Self-drive';
    const deliveryFee = isSelfDrive ? SELF_DRIVE_DELIVERY_FEE : 0;
    const securityDeposit = isSelfDrive ? calculateSecurityDeposit(subtotal) : 0;
    return subtotal + deliveryFee + securityDeposit;
  }, [car, nights, booking]);

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
    && editPickupLocation.trim() && editReturnLocation.trim();

  const handleSave = () => {
    if (!isEditValid) return;
    setIsSaving(true);
    updateBooking(booking.id, {
      startDate: editStart.toISOString(),
      endDate: editEnd.toISOString(),
      pickupTime: editPickupTime,
      returnTime: editReturnTime,
      pickupLocation: editPickupLocation,
      returnLocation: editReturnLocation,
      totalCost: recomputedTotal,
    });
    setIsSaving(false);
    setIsEditing(false);
  };

  const handleConfirmCancel = () => {
    cancelBooking(booking.id);
    setIsCancelModalVisible(false);
  };

  if (!booking) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.notFoundText}>Booking not found.</Text>
      </View>
    );
  }

  const statusStyle = STATUS_COLORS[booking.status] ?? STATUS_COLORS.Pending;
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
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>{booking.status}</Text>
          </View>
        </View>
      </View>

      {!isEditing ? (
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
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Modify Trip Details</Text>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Dates</Text>
            <TouchableOpacity style={styles.dateButton} onPress={() => setIsDatePickerVisible(true)}>
              <Ionicons name="calendar-outline" size={16} color={COLORS.teal} />
              <Text style={styles.dateButtonText}>
                {editStart && editEnd
                  ? `${formatDateShort(editStart)} — ${formatDateShort(editEnd)}`
                  : 'Select dates'}
              </Text>
            </TouchableOpacity>
          </View>

          <TimeSlotPicker label="Pickup Time" value={editPickupTime} onChange={setEditPickupTime} />
          <TimeSlotPicker label="Return Time" value={editReturnTime} onChange={setEditReturnTime} />

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Pickup Location</Text>
            <TextInput
              style={styles.input}
              value={editPickupLocation}
              onChangeText={handlePickupLocationChange}
              placeholder="e.g. Impact Hub, Accra"
              placeholderTextColor="#999"
            />
          </View>

          <TouchableOpacity style={styles.checkboxRow} onPress={toggleSameAsPickup}>
            <View style={[styles.checkbox, sameAsPickup && styles.checkboxChecked]}>
              {sameAsPickup && <Ionicons name="checkmark" size={14} color="#ffffff" />}
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
                placeholderTextColor="#999"
              />
            </View>
          )}

          {!!car && nights > 0 && (
            <View style={styles.recomputedBox}>
              <Text style={styles.recomputedLabel}>New total for {nights} {nights === 1 ? 'night' : 'nights'}</Text>
              <Text style={styles.recomputedValue}>{formatCurrency(recomputedTotal)}</Text>
            </View>
          )}
        </View>
      )}

      {!isEditing && (
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
          {isEditing ? (
            <>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setIsEditing(false)}>
                <Text style={styles.secondaryButtonText}>Discard Changes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, !isEditValid && styles.primaryButtonDisabled]}
                onPress={handleSave}
                disabled={!isEditValid || isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    color: '#666',
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    shadowColor: '#000',
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
    backgroundColor: '#EEF9F9',
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
    color: COLORS.navy,
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.navy,
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
    color: '#888',
  },
  rowValue: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: COLORS.navy,
    flexShrink: 1,
    textAlign: 'right',
  },
  totalValue: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.teal,
  },
  field: {
    marginBottom: 18,
  },
  fieldLabel: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: COLORS.navy,
    marginBottom: 8,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  dateButtonText: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.navy,
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
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  slotActive: {
    backgroundColor: COLORS.teal,
    borderColor: COLORS.teal,
  },
  slotText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: '#666',
  },
  slotTextActive: {
    fontFamily: FONTS.semiBold,
    color: '#ffffff',
  },
  input: {
    fontFamily: FONTS.regular,
    backgroundColor: COLORS.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e5e5e5',
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
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.teal,
    borderColor: COLORS.teal,
  },
  checkboxLabel: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.navy,
  },
  recomputedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EEF9F9',
    borderRadius: 10,
    padding: 14,
  },
  recomputedLabel: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.navy,
  },
  recomputedValue: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.teal,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: COLORS.teal,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#ccc',
  },
  primaryButtonText: {
    fontFamily: FONTS.semiBold,
    color: '#ffffff',
    fontSize: 15,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
  },
  secondaryButtonText: {
    fontFamily: FONTS.semiBold,
    color: '#666',
    fontSize: 15,
  },
  secondaryButtonTextDanger: {
    fontFamily: FONTS.semiBold,
    color: '#C62828',
    fontSize: 15,
  },
});
