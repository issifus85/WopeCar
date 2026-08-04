import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Switch, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useBookings } from '../../contexts/BookingsContext';
import { fetchCarById } from '../../services/carsApi';
import * as rentalAgreementStorage from '../../services/rentalAgreementStorage';
import {
  getRentalAgreement,
  saveRentalAgreementDraft,
  uploadRentalAgreementSignature,
  submitRentalAgreement,
} from '../../services/rentalAgreementApi';
import CheckoutFooterButton from '../../components/CheckoutFooterButton';
import SignaturePad from '../../components/SignaturePad';
import ObligationsModal from '../../components/ObligationsModal';

const REQUIRED_FIELDS = ['lesseeName', 'vehicleRegistration', 'vehicleMake', 'dailyRate', 'durationStart', 'durationEnd'];
const SIGNATURE_MODES = [
  { key: 'draw', label: 'Signature' },
  { key: 'initials', label: 'Initials' },
];
const SYNC_DEBOUNCE_MS = 800;

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function SignatureSlot({ label, value, mode, onModeChange, padRef, onOK, onEmpty, onBegin, onEnd, onEdit, styles }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{label}</Text>
        {!!value && (
          <TouchableOpacity onPress={onEdit}>
            <Text style={styles.editLink}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>

      {!value && (
        <View style={styles.modeToggle}>
          {SIGNATURE_MODES.map((m) => (
            <TouchableOpacity
              key={m.key}
              style={[styles.modeButton, mode === m.key && styles.modeButtonActive]}
              onPress={() => onModeChange(m.key)}
            >
              <Text style={[styles.modeButtonText, mode === m.key && styles.modeButtonTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View pointerEvents={value ? 'none' : 'auto'}>
        <SignaturePad key={mode} ref={padRef} mode={mode} onOK={onOK} onEmpty={onEmpty} onBegin={onBegin} onEnd={onEnd} />
      </View>

      {!value && (
        <TouchableOpacity style={styles.confirmButton} onPress={() => padRef.current?.readSignature()}>
          <Text style={styles.confirmButtonText}>Confirm {mode === 'initials' ? 'Initials' : 'Signature'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function RentalAgreementScreen() {
  const { bookingId, localId } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { bookings } = useBookings();
  const booking = bookings.find((b) => b.id === localId);

  const [car, setCar] = useState(null);
  const [fields, setFields] = useState({
    lesseeName: '',
    vehicleRegistration: '',
    vehicleMake: '',
    vehicleColor: '',
    vehicleYear: '',
    dailyRate: '',
    securityDeposit: '',
    durationStart: '',
    durationEnd: '',
    pickupTime: '',
    returnTime: '',
    ghanaOnlyUse: true,
  });
  const [signatures, setSignatures] = useState({ client: null, representative: null });
  const [agreementId, setAgreementId] = useState(null);
  const [hasDraftSource, setHasDraftSource] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clientMode, setClientMode] = useState('draw');
  const [representativeMode, setRepresentativeMode] = useState('draw');
  const [scrollLocked, setScrollLocked] = useState(false);
  const [isObligationsVisible, setIsObligationsVisible] = useState(false);

  const clientPadRef = useRef(null);
  const representativePadRef = useRef(null);
  const syncTimerRef = useRef(null);

  useEffect(() => {
    if (booking?.carId) {
      fetchCarById(booking.carId).then(setCar).catch(() => setCar(null));
    }
  }, [booking?.carId]);

  // Local draft first (fastest, offline-safe), then server. Only decides
  // whether a draft/remote source exists - never reads booking/user here,
  // since those come from other contexts that may still be loading when
  // this fires; seeding blank-field defaults from them is a separate,
  // reactive effect below so it isn't stuck with a stale first-render value.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = await rentalAgreementStorage.getDraft();
      if (local && !cancelled) {
        setFields((prev) => ({ ...prev, ...local.fields }));
        setSignatures(local.signatures ?? { client: null, representative: null });
        setAgreementId(local.agreementId ?? null);
        setHasDraftSource(true);
        setIsLoaded(true);
        return;
      }

      const remote = await getRentalAgreement(bookingId).catch(() => null);
      if (remote && !cancelled) {
        setFields({
          lesseeName: remote.lesseeName,
          vehicleRegistration: remote.vehicleRegistration,
          vehicleMake: remote.vehicleMake,
          vehicleColor: remote.vehicleColor,
          vehicleYear: remote.vehicleYear,
          dailyRate: remote.dailyRate ? String(remote.dailyRate) : '',
          securityDeposit: remote.securityDeposit ? String(remote.securityDeposit) : '',
          durationStart: remote.durationStart,
          durationEnd: remote.durationEnd,
          pickupTime: remote.pickupTime,
          returnTime: remote.returnTime,
          ghanaOnlyUse: remote.ghanaOnlyUse,
        });
        setAgreementId(remote.id);
        setHasDraftSource(true);
      }
      if (!cancelled) setIsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  // Reactively fills blank fields from the booking/user/car once each
  // becomes available (they load from separate contexts/fetches that may
  // still be in flight on first render) - only touches fields that are
  // still empty, so it can never clobber a resumed draft or a user's edit,
  // and re-firing as more data arrives is safe/idempotent.
  useEffect(() => {
    if (hasDraftSource || !isLoaded) return;
    setFields((prev) => ({
      ...prev,
      lesseeName: prev.lesseeName || user?.name || '',
      vehicleMake: prev.vehicleMake || booking?.carName || '',
      durationStart: prev.durationStart || (booking?.startDate ? String(booking.startDate).slice(0, 10) : ''),
      durationEnd: prev.durationEnd || (booking?.endDate ? String(booking.endDate).slice(0, 10) : ''),
      pickupTime: prev.pickupTime || booking?.pickupTime || '',
      returnTime: prev.returnTime || booking?.returnTime || '',
      dailyRate: prev.dailyRate || (car?.pricePerDay ? String(car.pricePerDay) : ''),
    }));
  }, [hasDraftSource, isLoaded, user, booking, car]);

  const scheduleSync = useCallback(
    (latestFields) => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(async () => {
        try {
          const result = await saveRentalAgreementDraft(bookingId, latestFields);
          setAgreementId(result.id);
        } catch (e) {
          // Best-effort - the local draft already has the values; the next
          // field change (or Generate Agreement) retries the sync.
        }
      }, SYNC_DEBOUNCE_MS);
    },
    [bookingId]
  );

  const updateField = useCallback(
    (key, value) => {
      setFields((prev) => {
        const next = { ...prev, [key]: value };
        rentalAgreementStorage.setDraft({ fields: next, signatures, agreementId });
        scheduleSync(next);
        return next;
      });
    },
    [signatures, agreementId, scheduleSync]
  );

  const handleClientOK = (dataUri) => {
    setSignatures((prev) => {
      const next = { ...prev, client: dataUri };
      rentalAgreementStorage.setDraft({ fields, signatures: next, agreementId });
      return next;
    });
  };
  const handleRepresentativeOK = (dataUri) => {
    setSignatures((prev) => {
      const next = { ...prev, representative: dataUri };
      rentalAgreementStorage.setDraft({ fields, signatures: next, agreementId });
      return next;
    });
  };
  const editClient = () => {
    clientPadRef.current?.clearSignature();
    setSignatures((prev) => {
      const next = { ...prev, client: null };
      rentalAgreementStorage.setDraft({ fields, signatures: next, agreementId });
      return next;
    });
  };
  const editRepresentative = () => {
    representativePadRef.current?.clearSignature();
    setSignatures((prev) => {
      const next = { ...prev, representative: null };
      rentalAgreementStorage.setDraft({ fields, signatures: next, agreementId });
      return next;
    });
  };

  const canSubmit =
    REQUIRED_FIELDS.every((key) => !!fields[key]) && !!signatures.client && !!signatures.representative;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      let id = agreementId;
      if (!id) {
        const result = await saveRentalAgreementDraft(bookingId, fields);
        id = result.id;
        setAgreementId(id);
      }

      await uploadRentalAgreementSignature(id, 'client', signatures.client);
      await uploadRentalAgreementSignature(id, 'representative', signatures.representative);
      await submitRentalAgreement(id);

      Alert.alert(
        'Agreement Generated',
        'The rental agreement has been saved to Documents > Trip Documents.',
        [
          { text: 'View Agreement', onPress: () => router.push({ pathname: '/rental-agreement/report', params: { bookingId } }) },
          {
            text: 'Done',
            onPress: async () => {
              await rentalAgreementStorage.clearDraft();
              // dismissTo (not push) - returns to the exact Booking Detail
              // instance that launched this screen instead of stacking a
              // duplicate on top, which breaks back-navigation afterward
              // (same fix applied to the Inspection wizard's Done button).
              router.dismissTo(`/booking/${localId}`);
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert('Could not generate agreement', e?.message || 'Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoaded) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rental Agreement</Text>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} scrollEnabled={!scrollLocked}>
        <TouchableOpacity style={styles.obligationsLink} onPress={() => setIsObligationsVisible(true)}>
          <Ionicons name="document-text-outline" size={18} color={colors.teal} />
          <Text style={styles.obligationsLinkText}>View Both Party Obligations</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Parties</Text>
        <View style={styles.field}>
          <Text style={styles.label}>Lessee (Client) Name</Text>
          <TextInput
            style={styles.input}
            value={fields.lesseeName}
            onChangeText={(v) => updateField('lesseeName', v)}
            placeholder="Full name"
            placeholderTextColor={colors.textSubtle}
          />
        </View>

        <Text style={styles.sectionTitle}>Vehicle</Text>
        <View style={styles.field}>
          <Text style={styles.label}>Registration Number</Text>
          <TextInput
            style={styles.input}
            value={fields.vehicleRegistration}
            onChangeText={(v) => updateField('vehicleRegistration', v)}
            placeholder="e.g. GT 1234-24"
            placeholderTextColor={colors.textSubtle}
            autoCapitalize="characters"
          />
        </View>
        <View style={styles.row}>
          <View style={[styles.field, styles.flex1]}>
            <Text style={styles.label}>Make</Text>
            <TextInput
              style={styles.input}
              value={fields.vehicleMake}
              onChangeText={(v) => updateField('vehicleMake', v)}
              placeholder="e.g. Kia Sportage"
              placeholderTextColor={colors.textSubtle}
            />
          </View>
          <View style={[styles.field, styles.flex1]}>
            <Text style={styles.label}>Colour</Text>
            <TextInput
              style={styles.input}
              value={fields.vehicleColor}
              onChangeText={(v) => updateField('vehicleColor', v)}
              placeholder="e.g. Silver"
              placeholderTextColor={colors.textSubtle}
            />
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Year of Manufacture</Text>
          <TextInput
            style={styles.input}
            value={fields.vehicleYear}
            onChangeText={(v) => updateField('vehicleYear', v)}
            placeholder="e.g. 2013"
            placeholderTextColor={colors.textSubtle}
            keyboardType="numeric"
          />
        </View>

        <Text style={styles.sectionTitle}>Rental Terms</Text>
        <View style={styles.row}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Pickup</Text>
            <Text style={styles.summaryValue}>{formatDate(fields.durationStart)} · {fields.pickupTime || '—'}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Return</Text>
            <Text style={styles.summaryValue}>{formatDate(fields.durationEnd)} · {fields.returnTime || '—'}</Text>
          </View>
        </View>
        <View style={styles.row}>
          <View style={[styles.field, styles.flex1]}>
            <Text style={styles.label}>Daily Rate (GHS)</Text>
            <TextInput
              style={styles.input}
              value={fields.dailyRate}
              onChangeText={(v) => updateField('dailyRate', v)}
              placeholder="0.00"
              placeholderTextColor={colors.textSubtle}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={[styles.field, styles.flex1]}>
            <Text style={styles.label}>Security Deposit (GHS)</Text>
            <TextInput
              style={styles.input}
              value={fields.securityDeposit}
              onChangeText={(v) => updateField('securityDeposit', v)}
              placeholder="0.00"
              placeholderTextColor={colors.textSubtle}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Vehicle only used within Ghana</Text>
          <Switch
            value={fields.ghanaOnlyUse}
            onValueChange={(v) => updateField('ghanaOnlyUse', v)}
            trackColor={{ false: colors.disabled, true: colors.teal }}
            thumbColor={colors.white}
          />
        </View>

        <SignatureSlot
          label="Client Signature"
          value={signatures.client}
          mode={clientMode}
          onModeChange={setClientMode}
          padRef={clientPadRef}
          onOK={handleClientOK}
          onEmpty={() => {}}
          onBegin={() => setScrollLocked(true)}
          onEnd={() => setScrollLocked(false)}
          onEdit={editClient}
          styles={styles}
        />
        <SignatureSlot
          label="WopeCar Representative Signature"
          value={signatures.representative}
          mode={representativeMode}
          onModeChange={setRepresentativeMode}
          padRef={representativePadRef}
          onOK={handleRepresentativeOK}
          onEmpty={() => {}}
          onBegin={() => setScrollLocked(true)}
          onEnd={() => setScrollLocked(false)}
          onEdit={editRepresentative}
          styles={styles}
        />
      </ScrollView>

      <CheckoutFooterButton
        label={isSubmitting ? 'Generating...' : 'Generate Agreement'}
        onPress={handleSubmit}
        disabled={!canSubmit || isSubmitting}
      />
      </KeyboardAvoidingView>

      <ObligationsModal
        visible={isObligationsVisible}
        onClose={() => setIsObligationsVisible(false)}
        ghanaOnlyUse={fields.ghanaOnlyUse}
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
    flex: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingTop: 56,
      paddingHorizontal: 20,
      paddingBottom: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    headerTitle: {
      fontFamily: FONTS.bold,
      fontSize: 20,
      color: colors.textPrimary,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    obligationsLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.background,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 20,
    },
    obligationsLinkText: {
      flex: 1,
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.teal,
    },
    sectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 15,
      color: colors.textPrimary,
      marginTop: 12,
      marginBottom: 12,
    },
    field: {
      marginBottom: 14,
    },
    row: {
      flexDirection: 'row',
      gap: 12,
    },
    flex1: {
      flex: 1,
    },
    label: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
      marginBottom: 8,
    },
    input: {
      fontFamily: FONTS.regular,
      backgroundColor: colors.background,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 14,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.textPrimary,
    },
    summaryItem: {
      flex: 1,
      backgroundColor: colors.background,
      borderRadius: 10,
      padding: 12,
      marginBottom: 14,
    },
    summaryLabel: {
      fontFamily: FONTS.medium,
      fontSize: 11,
      color: colors.textSubtle,
      marginBottom: 4,
    },
    summaryValue: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.background,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 20,
    },
    toggleLabel: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textPrimary,
      marginRight: 12,
    },
    section: {
      marginBottom: 24,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    editLink: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.teal,
    },
    modeToggle: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 10,
    },
    modeButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modeButtonActive: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    modeButtonText: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.textMuted,
    },
    modeButtonTextActive: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
    },
    confirmButton: {
      marginTop: 10,
      alignSelf: 'flex-start',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.teal,
    },
    confirmButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.teal,
    },
  });
}
