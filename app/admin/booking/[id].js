import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Image, Linking, KeyboardAvoidingView, Platform, PixelRatio, Alert } from 'react-native';
import { Image as CarImage } from 'expo-image';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { formatCurrency, WOPECARE_PLANS } from '../../../constants/pricing';
import SectionHeading from '../../../components/SectionHeading';
import BadgeStatus from '../../../components/admin/BadgeStatus';
import ConfirmModal from '../../../components/ConfirmModal';
import ReasonModal from '../../../components/admin/ReasonModal';
import MarkPaidModal from '../../../components/admin/MarkPaidModal';
import DateRangeModal from '../../../components/DateRangeModal';
import {
  getBooking, confirmBooking, cancelBooking, markBookingPaid, markBookingCompleted, recordBalanceReceived,
  modifyBooking, recomputeBookingCost, getModifyPricingContext,
} from '../../../services/adminBookingsApi';
import { getUserVerificationDocuments, getBookingInspections, getInspectionReportSignedUrl } from '../../../services/adminDocumentsApi';
import { parseDateOnly } from '../../../constants/dateUtils';
import { resizeImageUrl, CAR_PHOTO_BLURHASH } from '../../../utils/imageUrl';
import { getRentalAgreement, startRentalAgreementForBooking } from '../../../services/rentalAgreementApi';
import { inspectionAvailability } from '../../../constants/inspectionAvailability';

const VERIFICATION_DOC_LABELS = [
  { type: 'license_front', label: "License - Front" },
  { type: 'license_back', label: "License - Back" },
  { type: 'proof_of_address', label: 'Proof of Address' },
];

function VerificationDocsSection({ renterId, styles, colors }) {
  const [docs, setDocs] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!renterId) return;
    setIsLoading(true);
    getUserVerificationDocuments(renterId)
      .then(setDocs)
      .catch(() => setDocs({}))
      .finally(() => setIsLoading(false));
  }, [renterId]);

  if (!renterId) return null;

  return (
    <View style={styles.section}>
      <SectionHeading>Verification Documents</SectionHeading>
      {isLoading ? (
        <ActivityIndicator color={colors.teal} style={{ marginVertical: 8 }} />
      ) : (
        <View style={styles.docRow}>
          {VERIFICATION_DOC_LABELS.map(({ type, label }) => {
            const doc = docs?.[type];
            return (
              <TouchableOpacity
                key={type}
                style={styles.docTile}
                disabled={!doc}
                onPress={() => doc && Linking.openURL(doc.signedUrl)}
              >
                {doc ? (
                  <Image source={{ uri: doc.signedUrl }} style={styles.docThumbnail} />
                ) : (
                  <View style={[styles.docThumbnail, styles.docThumbnailEmpty]}>
                    <Ionicons name="document-outline" size={20} color={colors.textSubtle} />
                  </View>
                )}
                <Text style={styles.docTileLabel} numberOfLines={1}>{label}</Text>
                <Text style={styles.docTileHint}>{doc ? 'Tap to view' : 'Not on file'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const INSPECTION_ROWS = [
  { type: 'pre', label: 'Pre-Rental' },
  { type: 'post', label: 'Post-Rental' },
];
const EMPTY_INSPECTION_STATUS = { status: null, reportPdfPath: null, submittedAt: null };

function inspectionBadgeLabel(status) {
  if (status === 'submitted') return 'Submitted';
  if (status === 'draft') return 'In Progress';
  return 'Not Started';
}

/**
 * Previously this screen had zero inspection references at all - admin had
 * no way to tell whether pre/post inspections were even started, let alone
 * open the generated report. Tapping a row opens the already-built native
 * report screen (faster for triage); the document icon opens the PDF
 * artifact directly, for when the admin wants to forward/save it.
 */
function InspectionReportsSection({ bookingId, bookingStatus, router, styles, colors }) {
  const [inspections, setInspections] = useState(null);
  const [openingType, setOpeningType] = useState(null);

  // Re-read on every focus (not just on mount): coming back from the wizard must show the inspection as In Progress / Submitted, and
  // that is also what unlocks Post-Rental once Pre-Rental has been submitted. Without it the rows stayed on the first-load state.
  useFocusEffect(useCallback(() => {
    if (!bookingId) return;
    getBookingInspections(bookingId)
      .then(setInspections)
      .catch(() => setInspections((prev) => prev ?? { pre: EMPTY_INSPECTION_STATUS, post: EMPTY_INSPECTION_STATUS }));
  }, [bookingId, bookingStatus]));

  if (!bookingId) return null;

  const handleOpenPdf = async (type, path) => {
    setOpeningType(type);
    try {
      const url = await getInspectionReportSignedUrl(path);
      if (url) Linking.openURL(url);
    } finally {
      setOpeningType(null);
    }
  };

  return (
    <View style={styles.section}>
      <SectionHeading>Inspection Reports</SectionHeading>
      {!inspections ? (
        <ActivityIndicator color={colors.teal} style={{ marginVertical: 8 }} />
      ) : (
        INSPECTION_ROWS.map(({ type, label }) => {
          const data = inspections[type] ?? EMPTY_INSPECTION_STATUS;
          const isSubmitted = data.status === 'submitted';
          // Same sequence the renter and vendor screens use: Pre-Rental once the booking is confirmed, Post-Rental only after the
          // Pre-Rental inspection is submitted. A submitted report can always be opened, whatever the booking's status is now.
          const { available, reason } = inspectionAvailability({ type, bookingStatus, preStatus: inspections.pre?.status });
          const canOpen = isSubmitted || available;
          // Admin can run the inspection with the client (same wizard the client uses, same record - the client sees it on their booking
          // and gets the report emailed). A submitted inspection opens its report instead.
          const startInspection = () =>
            router.push({ pathname: '/inspection/mileage', params: { bookingId, localId: bookingId, type, from: 'admin' } });
          return (
            <TouchableOpacity
              key={type}
              style={styles.row}
              disabled={!canOpen}
              onPress={() => (isSubmitted ? router.push({ pathname: '/inspection/report', params: { bookingId, type } }) : startInspection())}
            >
              <Text style={styles.rowLabel}>{label}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={[styles.rowValue, !canOpen && { color: colors.textSubtle }]}>
                  {isSubmitted ? 'Submitted' : !available ? reason : data.status === 'draft' ? 'In Progress - Continue' : 'Not Started - Start'}
                </Text>
                {!!data.reportPdfPath && (
                  <TouchableOpacity onPress={() => handleOpenPdf(type, data.reportPdfPath)} disabled={openingType === type}>
                    <Ionicons name="document-text-outline" size={18} color={colors.teal} />
                  </TouchableOpacity>
                )}
                {canOpen && <Ionicons name={isSubmitted ? 'chevron-forward' : 'play-circle-outline'} size={18} color={colors.teal} />}
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
}

function agreementBadgeLabel(agreement) {
  if (!agreement) return 'Not Started - Start';
  if (agreement.status === 'submitted') return 'Signed';
  const signed = [agreement.hasClientSignature, agreement.hasRepresentativeSignature].filter(Boolean).length;
  return signed > 0 ? `Draft saved (${signed}/2 signatures) - Continue` : 'Draft saved - Continue';
}

/**
 * The booking's client rental agreement. The admin can START it here (like the inspections): the draft is created and saved on the server
 * the moment it is initiated, prefilled from the booking, and is only SUBMITTED when the agreement is completed (both signatures). It is the
 * same record the renter sees in their Trip Documents; a PDF copy is emailed to the renter and WopeCar on submit and can be opened here.
 * A submitted agreement opens the read-only report instead.
 */
function RentalAgreementSection({ bookingId, bookingStatus, router, styles, colors }) {
  const [agreement, setAgreement] = useState(undefined);
  const [isStarting, setIsStarting] = useState(false);
  const [isOpeningPdf, setIsOpeningPdf] = useState(false);

  // Re-read on every focus so coming back from the form shows the saved draft / signed state.
  useFocusEffect(useCallback(() => {
    if (!bookingId) return;
    getRentalAgreement(bookingId)
      .then(setAgreement)
      .catch(() => setAgreement((prev) => prev ?? null));
  }, [bookingId]));

  if (!bookingId) return null;

  const isSubmitted = agreement?.status === 'submitted';
  const cancelled = String(bookingStatus || '').toLowerCase() === 'cancelled';
  const canOpen = isSubmitted || !cancelled;

  const handlePress = async () => {
    if (isSubmitted) {
      router.push({ pathname: '/rental-agreement/report', params: { bookingId } });
      return;
    }
    setIsStarting(true);
    try {
      // Saves the draft (prefilled from the booking) on the server now, before anything is typed.
      const draft = agreement ?? (await startRentalAgreementForBooking(bookingId));
      setAgreement(draft);
      router.push({ pathname: '/rental-agreement/[bookingId]', params: { bookingId, localId: bookingId, from: 'admin' } });
    } catch (e) {
      Alert.alert('Could not start the agreement', e?.message || 'Please check your connection and try again.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleOpenPdf = async () => {
    setIsOpeningPdf(true);
    try {
      const url = await getInspectionReportSignedUrl(agreement.reportPdfPath);
      if (url) Linking.openURL(url);
    } finally {
      setIsOpeningPdf(false);
    }
  };

  return (
    <View style={styles.section}>
      <SectionHeading>Rental Agreement</SectionHeading>
      {agreement === undefined ? (
        <ActivityIndicator color={colors.teal} style={{ marginVertical: 8 }} />
      ) : (
        <TouchableOpacity style={styles.row} disabled={!canOpen || isStarting} onPress={handlePress}>
          <Text style={styles.rowLabel}>Client agreement</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={[styles.rowValue, !canOpen && { color: colors.textSubtle }]}>
              {isStarting ? 'Opening...' : !canOpen ? 'Booking cancelled' : agreementBadgeLabel(agreement)}
            </Text>
            {!!agreement?.reportPdfPath && (
              <TouchableOpacity onPress={handleOpenPdf} disabled={isOpeningPdf}>
                <Ionicons name="document-text-outline" size={18} color={colors.teal} />
              </TouchableOpacity>
            )}
            {canOpen && <Ionicons name={isSubmitted ? 'chevron-forward' : 'play-circle-outline'} size={18} color={colors.teal} />}
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const STATUS_TONE = { pending: 'warning', confirmed: 'success', cancelled: 'error', completed: 'muted' };
const TIME_SLOTS = [
  '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM',
];

function formatDate(d) {
  if (!d) return '—';
  return parseDateOnly(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
  const navigation = useNavigation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Custom headerLeft, not the default native-stack back button - this
  // screen is pushed from inside admin/(tabs) to a Stack.Screen registered
  // as that tabs group's sibling in admin/_layout.js, the same combination
  // that leaves the default back button's bare GO_BACK action unresolved
  // elsewhere in this app (see app/booking/[id].js's handleBack and
  // app/inbox/index.js's matching fix - canGoBack() isn't a safe guard
  // either, it reports true even in the broken state).
  const handleBack = useCallback(() => {
    router.replace('/admin/(tabs)/bookings');
  }, [router]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={handleBack} hitSlop={10} style={styles.headerBackButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          <Text style={styles.headerBackLabel}>Back</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleBack, styles, colors]);

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

  // Per-date prices, promo definition and the real delivery fee for the
  // edited trip - fetched so the preview uses the same inputs modifyBooking()
  // will save with (no preview until they land, rather than a wrong one).
  const [modifyCtx, setModifyCtx] = useState(null);
  useEffect(() => {
    if (!isEditing || !booking || !editStart || !editEnd) {
      setModifyCtx(null);
      return undefined;
    }
    let cancelled = false;
    setModifyCtx(null);
    getModifyPricingContext(booking, {
      startDate: editStart.toISOString().slice(0, 10),
      endDate: editEnd.toISOString().slice(0, 10),
    }).then((ctx) => { if (!cancelled) setModifyCtx(ctx); }).catch(() => {});
    return () => { cancelled = true; };
  }, [isEditing, booking, editStart, editEnd]);

  const previewCosts = useMemo(() => {
    if (!isEditing || !booking || !editStart || !editEnd || !modifyCtx) return null;
    return recomputeBookingCost(booking, {
      startDate: editStart.toISOString().slice(0, 10),
      endDate: editEnd.toISOString().slice(0, 10),
      pickupTime: editPickupTime,
      returnTime: editReturnTime,
    }, modifyCtx);
  }, [isEditing, booking, editStart, editEnd, editPickupTime, editReturnTime, modifyCtx]);

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
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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

            <VerificationDocsSection renterId={booking.renter?.id} styles={styles} colors={colors} />

            <InspectionReportsSection bookingId={booking.id} bookingStatus={booking.status} router={router} styles={styles} colors={colors} />

            <RentalAgreementSection bookingId={booking.id} bookingStatus={booking.status} router={router} styles={styles} colors={colors} />

            <View style={styles.section}>
              <SectionHeading>Car</SectionHeading>
              {/* Photo + name + link to the car's admin screen, so two look-alike cars from the same vendor can be told apart. */}
              <TouchableOpacity
                style={styles.carCard}
                activeOpacity={0.7}
                disabled={!booking.car_id}
                onPress={() => router.push(`/admin/car/edit/${booking.car_id}`)}
              >
                {booking.cars?.images?.[0] ? (
                  <CarImage
                    source={{ uri: resizeImageUrl(booking.cars.images[0], { width: 72 * PixelRatio.get(), height: 72 * PixelRatio.get() }) }}
                    style={styles.carThumb}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
                    placeholder={CAR_PHOTO_BLURHASH}
                    placeholderContentFit="cover"
                  />
                ) : (
                  <View style={[styles.carThumb, styles.carThumbPlaceholder]} />
                )}
                <View style={styles.carCardInfo}>
                  <Text style={styles.carCardName} numberOfLines={2}>{booking.cars?.name ?? '—'}</Text>
                  {!!booking.cars?.type && <Text style={styles.carCardType} numberOfLines={1}>{booking.cars.type}</Text>}
                  {!!booking.car_id && (
                    <View style={styles.carCardLink}>
                      <Text style={styles.carCardLinkText}>View car</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.teal} />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
              <Row label="Vendor" value={booking.vendors?.business_name} styles={styles} />
              <Row
                label="Booked via"
                value={booking.booking_source === 'app' ? 'Mobile app' : booking.booking_source === 'website' ? 'Website' : booking.booking_source === 'admin' ? 'Admin' : 'Unknown (before tracking)'}
                styles={styles}
              />
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
              {booking.drive_type === 'Self-drive' && (
                <Row
                  label="Driver"
                  value={booking.with_driver ? `WopeCar Driver (${formatCurrency(booking.with_driver_daily_rate)}/day${booking.with_driver_days ? `, ${booking.with_driver_days} of ${booking.billable_days} days` : ''})` : 'Self-drive (no driver)'}
                  styles={styles}
                />
              )}
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
              <SectionHeading>WopeCare Protection</SectionHeading>
              {booking.wopecare_plan && booking.wopecare_plan !== 'none' ? (
                <>
                  <Row label="Plan" value={WOPECARE_PLANS[booking.wopecare_plan]?.name ?? booking.wopecare_plan} styles={styles} />
                  <Row label="Coverage" value={`Up to ${formatCurrency(booking.wopecare_coverage)}`} styles={styles} />
                  <Row label="Daily Rate" value={`${formatCurrency(booking.wopecare_daily_rate)}/day`} styles={styles} />
                </>
              ) : (
                <Row label="Plan" value="No protection selected" styles={styles} />
              )}
            </View>

            <View style={styles.section}>
              <SectionHeading>Cost Breakdown</SectionHeading>
              <Row label="Rental Cost" value={formatCurrency(booking.rental_cost)} styles={styles} />
              <Row label="Add-ons Cost" value={formatCurrency(booking.addons_cost)} styles={styles} />
              {!!booking.with_driver && (
                <Row label="With Driver" value={formatCurrency(booking.with_driver_total_cost)} styles={styles} />
              )}
              {!!booking.wopecare_plan && booking.wopecare_plan !== 'none' && (
                <Row label="WopeCare" value={formatCurrency(booking.wopecare_total_cost)} styles={styles} />
              )}
              <Row label="Delivery Fee" value={formatCurrency(booking.delivery_fee)} styles={styles} />
              <Row label="Security Deposit" value={formatCurrency(booking.security_deposit)} styles={styles} />
              {Number(booking.promo_discount_amount) > 0 && (
                <Row
                  label={booking.promo_code ? `Promo Code (${booking.promo_code})` : 'Promo Discount'}
                  value={`-${formatCurrency(booking.promo_discount_amount)}`}
                  styles={styles}
                />
              )}
              <Row label="Total" value={formatCurrency(booking.total_cost)} styles={styles} />
              {Number(booking.refund_amount) > 0 && (
                <Row label="Refunded" value={formatCurrency(booking.refund_amount)} styles={styles} />
              )}
            </View>

            <View style={styles.section}>
              <SectionHeading>Payment & Status</SectionHeading>
              <Row label="Payment Reference" value={booking.payment_ref || 'Not set'} styles={styles} />
              <Row label="Payment Status" value={booking.payment_status} styles={styles} />
              {booking.payment_status === 'paid' && Number(booking.balance_due) > 0 && (
                <Row label="Balance Due" value={formatCurrency(booking.balance_due)} styles={styles} />
              )}
              <Row label="Vendor Acceptance" value={booking.vendor_accepted ? 'Accepted' : 'Not yet accepted'} styles={styles} />
              <Row label="Booking Status" value={booking.status} styles={styles} />
              <Row label="Created At" value={new Date(booking.created_at).toLocaleString()} styles={styles} />
            </View>

            <View style={styles.actions}>
              {booking.status === 'pending' && booking.payment_status === 'paid' && (
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
              {booking.payment_status === 'unpaid' && booking.status !== 'cancelled' && (
                <TouchableOpacity style={styles.secondaryButton} disabled={isSaving} onPress={() => setPendingAction('markPaid')}>
                  <Ionicons name="cash-outline" size={16} color={colors.teal} />
                  <Text style={styles.secondaryButtonText}>Mark as Paid</Text>
                </TouchableOpacity>
              )}
              {booking.payment_status === 'paid' && Number(booking.balance_due) > 0 && (
                <TouchableOpacity style={styles.secondaryButton} disabled={isSaving} onPress={() => setPendingAction('recordBalance')}>
                  <Ionicons name="cash-outline" size={16} color={colors.teal} />
                  <Text style={styles.secondaryButtonText}>Record Balance Received</Text>
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
                {booking.payment_status === 'paid' && Math.abs(previewCosts.totalCost - Number(booking.total_cost)) > 0.005 && (
                  <Row
                    label={previewCosts.totalCost > Number(booking.total_cost) ? 'Client will owe' : 'Total goes down by'}
                    value={formatCurrency(
                      previewCosts.totalCost > Number(booking.total_cost)
                        ? Math.max(0, previewCosts.totalCost - Number(booking.total_cost) + Number(booking.balance_due ?? 0))
                        : Number(booking.total_cost) - previewCosts.totalCost
                    )}
                    styles={styles}
                  />
                )}
                <Text style={styles.previewNote}>
                  {booking.payment_status === 'paid' && previewCosts.totalCost > Number(booking.total_cost)
                    ? 'The booking is already paid, so the client is emailed and notified to pay this balance. It will revert to pending until reconfirmed.'
                    : 'Booking will revert to pending until reconfirmed.'}
                </Text>
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
      </KeyboardAvoidingView>

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
        message={`${booking.booking_ref} will be confirmed. The renter and vendor will be notified.`}
        confirmLabel="Confirm"
        onConfirm={() => runAction(() => confirmBooking(booking))}
        onCancel={() => setPendingAction(null)}
      />
      <MarkPaidModal
        visible={pendingAction === 'markPaid'}
        bookingRef={booking.booking_ref}
        amount={booking.total_cost}
        onSubmit={(input) => runAction(() => markBookingPaid(booking, input))}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmModal
        visible={pendingAction === 'recordBalance'}
        title="Record balance received?"
        message={`${formatCurrency(booking.balance_due)} collected outside the app (cash or transfer) will be recorded against ${booking.booking_ref}, and the client is emailed a receipt.`}
        confirmLabel="Record Payment"
        onConfirm={() => runAction(() => recordBalanceReceived(booking))}
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
        message="The renter will be notified (and asked to pay any balance if the booking is already paid), and the booking will revert to pending until reconfirmed."
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
    flex: {
      flex: 1,
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
    docRow: {
      flexDirection: 'row',
      gap: 10,
    },
    docTile: {
      flex: 1,
      alignItems: 'center',
      gap: 6,
    },
    docThumbnail: {
      width: '100%',
      aspectRatio: 1.4,
      borderRadius: 10,
      backgroundColor: colors.background,
    },
    docThumbnailEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
    },
    docTileLabel: {
      fontFamily: FONTS.semiBold,
      fontSize: 11,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    docTileHint: {
      fontFamily: FONTS.regular,
      fontSize: 10,
      color: colors.textSubtle,
      textAlign: 'center',
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    carCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingBottom: 10,
      marginBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    carThumb: {
      width: 72,
      height: 72,
      borderRadius: 12,
      backgroundColor: colors.divider,
    },
    carThumbPlaceholder: {
      borderWidth: 1,
      borderColor: colors.border,
    },
    carCardInfo: {
      flex: 1,
      gap: 3,
    },
    carCardName: {
      fontFamily: FONTS.bold,
      fontSize: 15,
      color: colors.textPrimary,
    },
    carCardType: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
    },
    carCardLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      marginTop: 2,
    },
    carCardLinkText: {
      fontFamily: FONTS.semiBold,
      fontSize: 12.5,
      color: colors.teal,
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
