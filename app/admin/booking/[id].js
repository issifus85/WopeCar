import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { formatCurrency } from '../../../constants/pricing';
import SectionHeading from '../../../components/SectionHeading';
import BadgeStatus from '../../../components/admin/BadgeStatus';
import ConfirmModal from '../../../components/ConfirmModal';
import ReasonModal from '../../../components/admin/ReasonModal';
import DateRangeModal from '../../../components/DateRangeModal';
import {
  getBooking, confirmBooking, cancelBooking, markBookingPaid, markBookingCompleted,
  modifyBooking, recomputeBookingCost,
} from '../../../services/adminBookingsApi';

const STATUS_TONE = { pending: 'warning', confirmed: 'success', cancelled: 'error', completed: 'muted' };
const TIME_SLOTS = [
  '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM',
];

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function daysBetween(start, end) {
  if (!start || !end) return 0;
  return Math.max(1, Math.round((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24)));
}

function Row({ label, value, styles }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function TimeSlotPicker({ label, value, onChange, styles }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.slotGrid}>
        {TIME_SLOTS.map((slot) => (
          <TouchableOpacity key={slot} style={[styles.slot, value === slot && styles.slotActive]} onPress={() => onChange(slot)}>
            <Text style={[styles.slotText, value === slot && styles.slotTextActive]}>{slot}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function AdminBookingDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [booking, setBooking] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // 'confirm' | 'markPaid' | 'markCompleted' | 'saveModify' | null
  const [isCancelVisible, setIsCancelVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);

  const [editStart, setEditStart] = useState(null);
  const [editEnd, setEditEnd] = useState(null);
  const [editPickupTime, setEditPickupTime] = useState(null);
  const [editReturnTime, setEditReturnTime] = useState(null);
  const [editPickupLocation, setEditPickupLocation] = useState('');
  const [editReturnLocation, setEditReturnLocation] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      setBooking(await getBooking(id));
    } catch (e) {
      setError(e.message || 'Could not load booking.');
    }
  }, [id]);

  useEffect(() => {
    setIsLoading(true);
    load().finally(() => setIsLoading(false));
  }, [load]);

  const startEditing = () => {
    setEditStart(booking.start_date ? new Date(booking.start_date) : null);
    setEditEnd(booking.end_date ? new Date(booking.end_date) : null);
    setEditPickupTime(booking.pickup_time);
    setEditReturnTime(booking.return_time);
    setEditPickupLocation(booking.pickup_location ?? '');
    setEditReturnLocation(booking.return_location ?? '');
    setIsEditing(true);
  };

  const previewCosts = useMemo(() => {
    if (!isEditing || !booking || !editStart || !editEnd) return null;
    return recomputeBookingCost(booking, {
      startDate: editStart.toISOString().slice(0, 10),
      endDate: editEnd.toISOString().slice(0, 10),
      pickupTime: editPickupTime,
      returnTime: editReturnTime,
    });
  }, [isEditing, booking, editStart, editEnd, editPickupTime, editReturnTime]);

  const isModifyValid = editStart && editEnd && editPickupTime && editReturnTime
    && editPickupLocation.trim() && editReturnLocation.trim();

  const runAction = async (fn) => {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await fn();
      setBooking(updated);
    } catch (e) {
      setError(e.message || 'Action failed.');
    } finally {
      setIsSaving(false);
      setPendingAction(null);
    }
  };

  const handleCancel = (reason) => {
    setIsCancelVisible(false);
    runAction(() => cancelBooking(booking, reason));
  };

  const handleSaveModify = () => {
    runAction(() =>
      modifyBooking(booking, {
        startDate: editStart.toISOString().slice(0, 10),
        endDate: editEnd.toISOString().slice(0, 10),
        pickupTime: editPickupTime,
        returnTime: editReturnTime,
        pickupLocation: editPickupLocation.trim(),
        returnLocation: editReturnLocation.trim(),
      }).then((result) => {
        setIsEditing(false);
        return result;
      })
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.errorText}>{error || 'Booking not found.'}</Text>
      </View>
    );
  }

  const days = daysBetween(booking.start_date, booking.end_date);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.ref}>{booking.booking_ref}</Text>
          <View style={styles.badgeGroup}>
            {booking.payment_status === 'paid' && <BadgeStatus label="Paid" tone="success" />}
            <BadgeStatus label={booking.status} tone={STATUS_TONE[booking.status] || 'muted'} />
          </View>
        </View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        {!isEditing ? (
          <>
            <View style={styles.section}>
              <SectionHeading>Renter</SectionHeading>
              <Row label="Name" value={booking.renter?.full_name} styles={styles} />
              <Row label="Email" value={booking.renter?.email} styles={styles} />
              <Row label="Phone" value={booking.renter?.phone} styles={styles} />
            </View>

            <View style={styles.section}>
              <SectionHeading>Car</SectionHeading>
              <Row label="Name" value={booking.cars?.name} styles={styles} />
              <Row label="Type" value={booking.cars?.type} styles={styles} />
              <Row label="Vendor" value={booking.vendors?.business_name} styles={styles} />
            </View>

            <View style={styles.section}>
              <SectionHeading>Trip</SectionHeading>
              <Row label="Start Date" value={formatDate(booking.start_date)} styles={styles} />
              <Row label="End Date" value={formatDate(booking.end_date)} styles={styles} />
              <Row label="Total Days" value={days} styles={styles} />
              <Row label="Pickup Time" value={booking.pickup_time} styles={styles} />
              <Row label="Return Time" value={booking.return_time} styles={styles} />
              <Row label="Pickup Location" value={booking.pickup_location} styles={styles} />
              <Row label="Return Location" value={booking.return_location} styles={styles} />
              <Row label="Drive Type" value={booking.drive_type} styles={styles} />
            </View>

            {!!booking.addon_names?.length && (
              <View style={styles.section}>
                <SectionHeading>Add-ons</SectionHeading>
                {booking.addon_names.map((name, i) => (
                  <Row key={name} label={name} value={`${booking.addon_days?.[i] ?? '—'} day(s)`} styles={styles} />
                ))}
              </View>
            )}

            <View style={styles.section}>
              <SectionHeading>Cost Breakdown</SectionHeading>
              <Row label="Rental Cost" value={formatCurrency(booking.rental_cost)} styles={styles} />
              <Row label="Add-ons Cost" value={formatCurrency(booking.addons_cost)} styles={styles} />
              <Row label="Delivery Fee" value={formatCurrency(booking.delivery_fee)} styles={styles} />
              <Row label="Security Deposit" value={formatCurrency(booking.security_deposit)} styles={styles} />
              <Row label="Total" value={formatCurrency(booking.total_cost)} styles={styles} />
            </View>

            <View style={styles.section}>
              <SectionHeading>Payment & Status</SectionHeading>
              <Row label="Payment Reference" value={booking.payment_ref || 'Not set'} styles={styles} />
              <Row label="Payment Status" value={booking.payment_status} styles={styles} />
              <Row label="Vendor Acceptance" value={booking.vendor_accepted ? 'Accepted' : 'Not yet accepted'} styles={styles} />
              <Row label="Booking Status" value={booking.status} styles={styles} />
              <Row label="Created At" value={new Date(booking.created_at).toLocaleString()} styles={styles} />
            </View>

            <View style={styles.actions}>
              {booking.status === 'pending' && (
                <TouchableOpacity style={styles.primaryButton} disabled={isSaving} onPress={() => setPendingAction('confirm')}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={colors.white} />
                  <Text style={styles.primaryButtonText}>Confirm Booking</Text>
                </TouchableOpacity>
              )}
              {booking.status === 'confirmed' && (
                <TouchableOpacity style={styles.primaryButton} disabled={isSaving} onPress={() => setPendingAction('markCompleted')}>
                  <Ionicons name="flag-outline" size={16} color={colors.white} />
                  <Text style={styles.primaryButtonText}>Mark as Completed</Text>
                </TouchableOpacity>
              )}
              {booking.payment_status !== 'paid' && (
                <TouchableOpacity style={styles.secondaryButton} disabled={isSaving} onPress={() => setPendingAction('markPaid')}>
                  <Ionicons name="cash-outline" size={16} color={colors.teal} />
                  <Text style={styles.secondaryButtonText}>Mark as Paid</Text>
                </TouchableOpacity>
              )}
              {(booking.status === 'pending' || booking.status === 'confirmed') && (
                <TouchableOpacity style={styles.secondaryButton} disabled={isSaving} onPress={startEditing}>
                  <Ionicons name="create-outline" size={16} color={colors.teal} />
                  <Text style={styles.secondaryButtonText}>Modify Booking</Text>
                </TouchableOpacity>
              )}
              {booking.status !== 'cancelled' && booking.status !== 'completed' && (
                <TouchableOpacity style={styles.dangerButton} disabled={isSaving} onPress={() => setIsCancelVisible(true)}>
                  <Ionicons name="close-circle-outline" size={16} color={colors.error} />
                  <Text style={styles.dangerButtonText}>Cancel Booking</Text>
                </TouchableOpacity>
              )}
              {isSaving && <ActivityIndicator color={colors.teal} />}
            </View>
          </>
        ) : (
          <View style={styles.section}>
            <SectionHeading>Modify Booking</SectionHeading>

            <TouchableOpacity style={styles.dateField} onPress={() => setIsDatePickerVisible(true)}>
              <Ionicons name="calendar-outline" size={16} color={colors.teal} />
              <Text style={styles.dateFieldText}>
                {editStart && editEnd ? `${formatDate(editStart)} — ${formatDate(editEnd)}` : 'Select dates'}
              </Text>
            </TouchableOpacity>

            <TimeSlotPicker label="Pickup Time" value={editPickupTime} onChange={setEditPickupTime} styles={styles} />
            <TimeSlotPicker label="Return Time" value={editReturnTime} onChange={setEditReturnTime} styles={styles} />

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Pickup Location</Text>
              <TextInput
                style={styles.input}
                value={editPickupLocation}
                onChangeText={setEditPickupLocation}
                placeholder="Pickup location"
                placeholderTextColor={colors.textSubtle}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Return Location</Text>
              <TextInput
                style={styles.input}
                value={editReturnLocation}
                onChangeText={setEditReturnLocation}
                placeholder="Return location"
                placeholderTextColor={colors.textSubtle}
              />
            </View>

            {!!previewCosts && (
              <View style={styles.previewCard}>
                <Row label="New Total Days" value={previewCosts.days} styles={styles} />
                <Row label="New Total Cost" value={formatCurrency(previewCosts.totalCost)} styles={styles} />
                <Text style={styles.previewNote}>Booking will revert to pending until reconfirmed.</Text>
              </View>
            )}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setIsEditing(false)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, !isModifyValid && styles.primaryButtonDisabled]}
                disabled={!isModifyValid || isSaving}
                onPress={() => setPendingAction('saveModify')}
              >
                <Text style={styles.primaryButtonText}>Save Changes</Text>
              </TouchableOpacity>
              {isSaving && <ActivityIndicator color={colors.teal} />}
            </View>
          </View>
        )}
      </ScrollView>

      <DateRangeModal
        visible={isDatePickerVisible}
        onClose={() => setIsDatePickerVisible(false)}
        startDate={editStart}
        endDate={editEnd}
        onApply={(s, e) => { setEditStart(s); setEditEnd(e); }}
      />

      <ConfirmModal
        visible={pendingAction === 'confirm'}
        title="Confirm this booking?"
        message={`${booking.booking_ref} will be confirmed and marked as paid. The renter and vendor will be notified.`}
        confirmLabel="Confirm"
        onConfirm={() => runAction(() => confirmBooking(booking))}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmModal
        visible={pendingAction === 'markPaid'}
        title="Mark as paid?"
        message={`${booking.booking_ref} will be marked as paid, independent of its current status.`}
        confirmLabel="Mark as Paid"
        onConfirm={() => runAction(() => markBookingPaid(booking))}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmModal
        visible={pendingAction === 'markCompleted'}
        title="Mark as completed?"
        message={`${booking.booking_ref} will be marked as completed.`}
        confirmLabel="Mark as Completed"
        onConfirm={() => runAction(() => markBookingCompleted(booking))}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmModal
        visible={pendingAction === 'saveModify'}
        title="Save these changes?"
        message="The renter will be notified, and the booking will revert to pending until reconfirmed."
        confirmLabel="Save Changes"
        onConfirm={handleSaveModify}
        onCancel={() => setPendingAction(null)}
      />
      <ReasonModal
        visible={isCancelVisible}
        title="Cancel Booking"
        placeholder="Reason for cancellation..."
        submitLabel="Send & Cancel"
        onCancel={() => setIsCancelVisible(false)}
        onSubmit={handleCancel}
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
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    content: {
      padding: 16,
      paddingBottom: 40,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    ref: {
      fontFamily: FONTS.bold,
      fontSize: 17,
      color: colors.textPrimary,
    },
    badgeGroup: {
      flexDirection: 'row',
      gap: 6,
    },
    errorText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.error,
      textAlign: 'center',
      marginVertical: 8,
    },
    section: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginTop: 14,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    rowLabel: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
    },
    rowValue: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
      textAlign: 'right',
      flexShrink: 1,
      marginLeft: 10,
    },
    actions: {
      marginTop: 20,
      gap: 10,
      alignItems: 'stretch',
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.teal,
      borderRadius: 10,
      paddingVertical: 13,
    },
    primaryButtonDisabled: {
      opacity: 0.5,
    },
    primaryButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.white,
    },
    secondaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 10,
      paddingVertical: 13,
      borderWidth: 1,
      borderColor: colors.teal,
    },
    secondaryButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.teal,
    },
    dangerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 10,
      paddingVertical: 13,
      borderWidth: 1,
      borderColor: colors.error,
    },
    dangerButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.error,
    },
    dateField: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.background,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 13,
      marginBottom: 16,
    },
    dateFieldText: {
      fontFamily: FONTS.medium,
      fontSize: 14,
      color: colors.textPrimary,
    },
    field: {
      marginBottom: 16,
    },
    fieldLabel: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textPrimary,
      marginBottom: 8,
    },
    input: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textPrimary,
      backgroundColor: colors.background,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    slotGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    slot: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    slotActive: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    slotText: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.textMuted,
    },
    slotTextActive: {
      color: colors.white,
    },
    previewCard: {
      backgroundColor: colors.highlight,
      borderRadius: 10,
      padding: 12,
      marginTop: 4,
      marginBottom: 4,
    },
    previewNote: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
      marginTop: 8,
    },
  });
}
