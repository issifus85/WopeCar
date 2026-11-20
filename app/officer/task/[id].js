import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Linking } from 'react-native';
import { Image } from 'expo-image';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import BadgeStatus from '../../../components/admin/BadgeStatus';
import SectionHeading from '../../../components/SectionHeading';
import { FLEET_OFFICER_ENABLED, TRIP_STATUS_LABELS, TRIP_STATUS_TONES, tripTypeLabel, formatTripTime } from '../../../constants/fleetOfficer';
import { getMyTrip, respondToTrip, advanceTrip, sendQuickReply } from '../../../services/officerApi';
import { getInspection } from '../../../services/inspectionsApi';
import { getRentalAgreement } from '../../../services/rentalAgreementApi';
import { inspectionAvailability } from '../../../constants/inspectionAvailability';

const QUICK_REPLIES = [
  { kind: 'on_my_way', label: 'On my way' },
  { kind: 'running_late', label: 'Running 10 min late' },
  { kind: 'arrived', label: 'I have arrived' },
];

// Ghana numbers are usually saved as 0XXXXXXXXX; WhatsApp links need the country code.
function whatsappNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('233')) return digits;
  if (digits.startsWith('0')) return `233${digits.slice(1)}`;
  return digits;
}

function openDirections(address) {
  if (!address) return;
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`);
}

/**
 * One trip for the assigned officer: what, when, where, who, and the next step. The database (officer_advance_trip_task) only
 * lets the status move forward: Accept -> Start trip -> Arrived -> Complete. From Arrived the officer runs the booking's existing inspection
 * and rental agreement (same screens and records as admin); the trip completes itself once that paperwork is submitted.
 */
export default function OfficerTripScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [trip, setTrip] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  // The booking's existing inspection / agreement records (null = not started), read on every focus so coming back from the wizard shows
  // the saved draft or the submitted state.
  const [paperwork, setPaperwork] = useState(null);

  const isOfficer = FLEET_OFFICER_ENABLED && !!user?.isFleetOfficer;

  const load = useCallback(async () => {
    try {
      const next = await getMyTrip(id);
      setTrip(next);
      if (next?.bookingId) {
        const [pre, post, agreement] = await Promise.all([
          getInspection(next.bookingId, 'pre').catch(() => null),
          getInspection(next.bookingId, 'post').catch(() => null),
          getRentalAgreement(next.bookingId).catch(() => null),
        ]);
        setPaperwork({ pre, post, agreement });
      }
    } catch {
      setTrip(null);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    if (isOfficer) load();
  }, [isOfficer, load]));

  const run = useCallback(async (key, fn, { reload = true } = {}) => {
    setBusy(key);
    try {
      await fn();
      if (reload) await load();
    } catch (e) {
      Alert.alert('Something went wrong', e?.message || 'Please try again.');
      await load();
    } finally {
      setBusy(null);
    }
  }, [load]);

  if (!isOfficer) {
    return <Redirect href="/(tabs)/profile" />;
  }

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={COLORS.teal} size="large" />
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.disabled} />
        <Text style={styles.emptyTitle}>This trip is no longer assigned to you</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.replace('/officer')}>
          <Text style={styles.secondaryButtonText}>Back to My trips</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const typeLabel = tripTypeLabel(trip.type, trip.driveType);
  const destination = trip.type === 'delivery' ? trip.toAddress : trip.fromAddress || trip.toAddress;
  const isOpen = !['completed', 'cancelled'].includes(trip.status);
  const canQuickReply = !!trip.conversationId && ['accepted', 'en_route', 'arrived', 'inspecting'].includes(trip.status);

  const confirmDecline = () => Alert.alert(
    'Decline this trip?',
    'WopeCar will be told straight away so they can give it to another officer.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => run('decline', () => respondToTrip(trip.id, false), { reload: false }).then(() => router.replace('/officer')) },
    ]
  );

  const paperworkRows = buildPaperworkRows(trip, paperwork);
  const missing = paperworkRows.filter((r) => r.status !== 'submitted').map((r) => r.label.toLowerCase());
  const confirmComplete = () => Alert.alert(
    `Complete this ${typeLabel.toLowerCase()}?`,
    missing.length
      ? `The ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not submitted yet. Only complete the trip without ${missing.length > 1 ? 'them' : 'it'} if WopeCar has told you to.`
      : 'Only do this once the car has been handed over.',
    [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Complete', onPress: () => run('complete', () => advanceTrip(trip.id, 'completed')) },
    ]
  );

  // The inspection and agreement are started at the car: once the officer has arrived (as admin does today, same screens, same records).
  const paperworkReady = ['arrived', 'inspecting'].includes(trip.status);
  const openPaperwork = (row) => {
    const bookingId = trip.bookingId;
    if (row.kind === 'agreement') {
      if (row.status === 'submitted') router.push({ pathname: '/rental-agreement/report', params: { bookingId } });
      else router.push({ pathname: '/rental-agreement/[bookingId]', params: { bookingId, localId: bookingId, from: 'officer', taskId: trip.id } });
      return;
    }
    if (row.status === 'submitted') router.push({ pathname: '/inspection/report', params: { bookingId, type: row.kind } });
    else router.push({ pathname: '/inspection/mileage', params: { bookingId, localId: bookingId, type: row.kind, from: 'officer', taskId: trip.id } });
  };

  let primary = null;
  if (trip.status === 'assigned') primary = { key: 'accept', label: 'Accept trip', icon: 'checkmark-circle-outline', onPress: () => run('accept', () => respondToTrip(trip.id, true)) };
  else if (trip.status === 'accepted') primary = { key: 'start', label: 'Start trip', icon: 'navigate-outline', onPress: () => run('start', () => advanceTrip(trip.id, 'en_route')) };
  else if (trip.status === 'en_route') primary = { key: 'arrive', label: "I've arrived", icon: 'location-outline', onPress: () => run('arrive', () => advanceTrip(trip.id, 'arrived')) };
  else if (trip.status === 'arrived' || trip.status === 'inspecting') primary = { key: 'complete', label: `Complete ${typeLabel.toLowerCase()}`, icon: 'flag-outline', onPress: confirmComplete };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        {trip.carImage ? (
          <Image source={{ uri: trip.carImage }} style={styles.heroImage} contentFit="cover" />
        ) : (
          <View style={[styles.heroImage, styles.heroPlaceholder]}>
            <Ionicons name="car-sport-outline" size={32} color={COLORS.teal} />
          </View>
        )}
        <View style={styles.heroInfo}>
          <Text style={styles.typeLabel}>{typeLabel}</Text>
          <Text style={styles.title}>{trip.carName || 'Car'}</Text>
          <Text style={styles.subtitle}>{[trip.bookingRef, trip.driveType, trip.carTransmission].filter(Boolean).join(' · ')}</Text>
          <View style={styles.badgeRow}>
            <BadgeStatus label={TRIP_STATUS_LABELS[trip.status] || trip.status} tone={TRIP_STATUS_TONES[trip.status]} />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeading>When & where</SectionHeading>
        <View style={styles.row}>
          <Ionicons name="time-outline" size={18} color={colors.textSubtle} />
          <Text style={styles.rowText}>{formatTripTime(trip.scheduledAt)}</Text>
        </View>
        {!!trip.fromAddress && (
          <View style={styles.row}>
            <Ionicons name="ellipse-outline" size={18} color={colors.textSubtle} />
            <Text style={styles.rowText}>From: {trip.fromAddress}</Text>
          </View>
        )}
        {!!trip.toAddress && (
          <View style={styles.row}>
            <Ionicons name="location-outline" size={18} color={colors.textSubtle} />
            <Text style={styles.rowText}>To: {trip.toAddress}</Text>
          </View>
        )}
        {!!destination && isOpen && (
          <TouchableOpacity style={styles.linkRow} onPress={() => openDirections(destination)}>
            <Ionicons name="map-outline" size={18} color={COLORS.teal} />
            <Text style={styles.linkText}>Directions in Google Maps</Text>
          </TouchableOpacity>
        )}
        {!!trip.notes && <Text style={styles.notes}>{trip.notes}</Text>}
        {!!trip.startDate && (
          <Text style={styles.small}>Rental: {trip.startDate}{trip.endDate && trip.endDate !== trip.startDate ? ` to ${trip.endDate}` : ''}</Text>
        )}
      </View>

      {isOpen && (
        <View style={styles.section}>
          <SectionHeading>People</SectionHeading>
          <ContactRow label="Renter" name={trip.customerName} phone={trip.customerPhone} styles={styles} colors={colors} />
          {(!!trip.vendorName || !!trip.vendorPhone) && (
            <ContactRow label="Car owner" name={trip.vendorName} phone={trip.vendorPhone} styles={styles} colors={colors} />
          )}
          {!!trip.conversationId && (
            <TouchableOpacity style={styles.linkRow} onPress={() => router.push(`/inbox/booking-${trip.conversationId}`)}>
              <Ionicons name="chatbubbles-outline" size={18} color={COLORS.teal} />
              <Text style={styles.linkText}>Open the booking chat</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {paperworkRows.length > 0 && (
        <View style={styles.section}>
          <SectionHeading>Handover paperwork</SectionHeading>
          {!paperworkReady && !paperworkRows.some((r) => r.status === 'submitted') && (
            <Text style={styles.small}>Available once you've arrived.</Text>
          )}
          {paperworkRows.map((row) => {
            const submitted = row.status === 'submitted';
            const canStart = paperworkReady && row.available;
            const disabled = !submitted && !canStart;
            const label = submitted ? 'Submitted - View' : !row.available ? row.reason : row.status === 'draft' ? 'In progress - Continue' : 'Not started - Start';
            return (
              <TouchableOpacity key={row.key} style={styles.paperRow} disabled={disabled} onPress={() => openPaperwork(row)}>
                <Text style={styles.rowText}>{row.label}</Text>
                <Text style={[styles.paperStatus, disabled && { color: colors.textSubtle }, submitted && { color: colors.success }]}>{label}</Text>
                {!disabled && <Ionicons name={submitted ? 'chevron-forward' : 'play-circle-outline'} size={18} color={COLORS.teal} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {canQuickReply && (
        <View style={styles.section}>
          <SectionHeading>Quick replies</SectionHeading>
          <Text style={styles.small}>Sends the message in the booking chat.</Text>
          <View style={styles.chips}>
            {QUICK_REPLIES.map((q) => (
              <TouchableOpacity
                key={q.kind}
                style={styles.chip}
                disabled={!!busy}
                onPress={() => run(`qr-${q.kind}`, () => sendQuickReply(trip.id, q.kind), { reload: false }).then(() => Alert.alert('Sent', `"${q.label}" was sent in the chat.`))}
              >
                {busy === `qr-${q.kind}` ? <ActivityIndicator size="small" color={COLORS.teal} /> : <Text style={styles.chipText}>{q.label}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {!!primary && (
        <TouchableOpacity style={styles.primaryButton} onPress={primary.onPress} disabled={!!busy}>
          {busy === primary.key ? <ActivityIndicator color={colors.white} /> : (
            <>
              <Ionicons name={primary.icon} size={20} color={colors.white} />
              <Text style={styles.primaryButtonText}>{primary.label}</Text>
            </>
          )}
        </TouchableOpacity>
      )}
      {trip.status === 'assigned' && (
        <TouchableOpacity style={styles.secondaryButton} onPress={confirmDecline} disabled={!!busy}>
          <Text style={[styles.secondaryButtonText, { color: colors.error }]}>Decline</Text>
        </TouchableOpacity>
      )}
      {trip.status === 'completed' && (
        <Text style={styles.doneText}>Completed {trip.completedAt ? formatTripTime(trip.completedAt) : ''}</Text>
      )}
    </ScrollView>
  );
}

// What this trip covers: a delivery = the pre-rental inspection + the client rental agreement; a return pickup = the post-rental inspection.
function buildPaperworkRows(trip, paperwork) {
  if (!trip?.bookingId || !paperwork) return [];
  const pre = paperwork.pre?.status ?? null;
  const rows = trip.type === 'delivery'
    ? [
      { key: 'pre', kind: 'pre', label: 'Pre-rental inspection', status: pre },
      { key: 'agreement', kind: 'agreement', label: 'Rental agreement', status: paperwork.agreement?.status ?? null },
    ]
    : [{ key: 'post', kind: 'post', label: 'Post-rental inspection', status: paperwork.post?.status ?? null }];
  return rows.map((row) => {
    if (row.kind === 'agreement') return { ...row, available: true, reason: null };
    const { available, reason } = inspectionAvailability({ type: row.kind, bookingStatus: trip.bookingStatus, preStatus: pre });
    return { ...row, available, reason };
  });
}

function ContactRow({ label, name, phone, styles, colors }) {
  const wa = whatsappNumber(phone);
  return (
    <View style={styles.contactRow}>
      <View style={styles.contactInfo}>
        <Text style={styles.contactLabel}>{label}</Text>
        <Text style={styles.contactName}>{name || '—'}</Text>
        {!!phone && <Text style={styles.small}>{phone}</Text>}
      </View>
      {!!phone && (
        <View style={styles.contactActions}>
          <TouchableOpacity style={styles.iconButton} onPress={() => Linking.openURL(`tel:${phone}`)} hitSlop={6}>
            <Ionicons name="call-outline" size={18} color={COLORS.teal} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => Linking.openURL(`sms:${phone}`)} hitSlop={6}>
            <Ionicons name="chatbox-outline" size={18} color={COLORS.teal} />
          </TouchableOpacity>
          {!!wa && (
            <TouchableOpacity style={styles.iconButton} onPress={() => Linking.openURL(`https://wa.me/${wa}`)} hitSlop={6}>
              <Ionicons name="logo-whatsapp" size={18} color={colors.success} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
    content: { padding: 16, paddingBottom: 140, gap: 12 },
    hero: {
      flexDirection: 'row', gap: 12, padding: 12, backgroundColor: colors.surface, borderRadius: 12,
      shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    },
    heroImage: { width: 88, height: 88, borderRadius: 10 },
    heroPlaceholder: { backgroundColor: colors.highlight, alignItems: 'center', justifyContent: 'center' },
    heroInfo: { flex: 1, gap: 2 },
    typeLabel: { fontFamily: FONTS.semiBold, fontSize: 12, color: COLORS.teal, textTransform: 'uppercase' },
    title: { fontFamily: FONTS.bold, fontSize: 18, color: colors.textPrimary },
    subtitle: { fontFamily: FONTS.regular, fontSize: 12, color: colors.textSubtle },
    badgeRow: { flexDirection: 'row', marginTop: 6 },
    section: { padding: 12, backgroundColor: colors.surface, borderRadius: 12, gap: 8 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    rowText: { flex: 1, fontFamily: FONTS.regular, fontSize: 14, color: colors.textPrimary },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
    linkText: { fontFamily: FONTS.semiBold, fontSize: 14, color: COLORS.teal },
    notes: { fontFamily: FONTS.regular, fontSize: 13, color: colors.textBody, backgroundColor: colors.background, borderRadius: 8, padding: 10 },
    small: { fontFamily: FONTS.regular, fontSize: 12, color: colors.textSubtle },
    contactRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.divider },
    contactInfo: { flex: 1, gap: 1 },
    contactLabel: { fontFamily: FONTS.regular, fontSize: 11, color: colors.textSubtle, textTransform: 'uppercase' },
    contactName: { fontFamily: FONTS.semiBold, fontSize: 15, color: colors.textPrimary },
    contactActions: { flexDirection: 'row', gap: 8 },
    iconButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.highlight, alignItems: 'center', justifyContent: 'center' },
    paperRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
    paperStatus: { fontFamily: FONTS.semiBold, fontSize: 13, color: COLORS.teal },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: COLORS.teal, minWidth: 80, alignItems: 'center' },
    chipText: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.teal },
    primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.teal, borderRadius: 12, paddingVertical: 15, marginTop: 4 },
    primaryButtonText: { fontFamily: FONTS.semiBold, fontSize: 16, color: colors.white },
    secondaryButton: { alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 13, borderWidth: 1, borderColor: colors.border },
    secondaryButtonText: { fontFamily: FONTS.semiBold, fontSize: 15, color: colors.textPrimary },
    emptyTitle: { fontFamily: FONTS.semiBold, fontSize: 15, color: colors.textPrimary, textAlign: 'center' },
    doneText: { fontFamily: FONTS.regular, fontSize: 13, color: colors.textSubtle, textAlign: 'center', marginTop: 8 },
  });
}
