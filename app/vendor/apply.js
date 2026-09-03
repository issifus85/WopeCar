import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useVendor } from '../../contexts/VendorContext';
import { applyToBecomeVendor } from '../../services/vendorCarsApi';
import { logVendorRegistered } from '../../services/analytics';
import VendorHeader from '../../components/VendorHeader';
import CheckoutFooterButton from '../../components/CheckoutFooterButton';
import ConfirmModal from '../../components/ConfirmModal';

// Gate screen for entering Vendor Mode - see app/(tabs)/profile.js's
// switchToHostMode(). Deliberately narrow: only collects what maps onto the
// vendors table's two real identity columns (business_name/ghana_card_id).
// Deeper business/tax details (RGD number, TIN, business address) stay
// exactly where they already live - app/vendor/business-info.js, local-only,
// editable later once inside Vendor Mode.
export default function VendorApplyScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, isLoading: isAuthLoading } = useAuth();
  const { updateSetting } = useSettings();
  const { vendorProfile, isLoading: isVendorLoading, hasLoadError, refreshVendorProfile, refreshVendorData } = useVendor();
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // Reachable via a direct deep link, not just the Dashboard's own guard -
  // this screen needs its own auth check too, since Vendor Mode never had
  // one before this gate existed.
  useEffect(() => {
    if (!isAuthLoading && !user) router.replace('/login');
  }, [isAuthLoading, user, router]);

  // Defense-in-depth against the flow's own entry point
  // (switchToHostMode's getVendorProfile() check) - if someone lands here
  // by any other route (stale bookmark, deep link, browser back after
  // already applying) while already a vendor, bounce them to the real
  // Dashboard instead of letting them resubmit into the unique constraint.
  //
  // Reads VendorContext's own vendorProfile/isLoading (useVendor()) instead
  // of running a second, independent getVendorProfile() fetch here - this
  // used to call getVendorProfile() directly, which could resolve
  // differently than VendorContext's own copy (e.g. VendorContext's load()
  // timing out first-checkout in a session with a null fallback - see its
  // withTimeout comment). That produced a genuine infinite redirect loop:
  // this screen would find a real vendor row and bounce to /vendor, whose
  // own guard reads useVendor()'s still-null vendorProfile and immediately
  // bounces right back to /vendor/apply - a "constant load screen" that
  // reproduces on every relaunch and never resolves, since VendorContext's
  // one-time load never re-runs. A single shared source of truth for
  // vendorProfile makes that class of disagreement structurally impossible.
  useEffect(() => {
    if (isAuthLoading || isVendorLoading || !user) return;
    if (vendorProfile) {
      updateSetting('appMode', 'vendor');
      router.replace('/vendor');
    }
  }, [isAuthLoading, isVendorLoading, user, vendorProfile]);

  // Manual escape hatch, separate from the automatic check above - covers
  // any case where this screen is reached while VendorContext's own copy
  // of vendorProfile is stale/null for a reason other than "genuinely no
  // vendor row yet" (a failed fetch, per hasLoadError below, or simply
  // switching into an account whose vendor data hasn't loaded on this
  // device yet). Re-running the full load (not just the profile) means an
  // existing vendor who taps this lands on a Dashboard that already has
  // their real cars/bookings, not one that has to fetch them again.
  const handleCheckExistingStatus = async () => {
    setIsCheckingStatus(true);
    try {
      await refreshVendorData();
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const [type, setType] = useState('individual');
  const [name, setName] = useState(user?.name ?? '');
  const [ghanaCardId, setGhanaCardId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const isValid = name.trim().length > 0 && ghanaCardId.trim().length > 0;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const vendor = await applyToBecomeVendor({
        businessName: name.trim(),
        ghanaCardId: ghanaCardId.trim(),
      });
      logVendorRegistered({ vendorId: vendor.id });
      setShowSuccess(true);
    } catch (e) {
      Alert.alert('Could not submit application', e?.message || 'Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDone = async () => {
    await refreshVendorProfile();
    updateSetting('appMode', 'vendor');
    router.replace('/vendor');
  };

  if (isAuthLoading || isVendorLoading || !user || vendorProfile) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  // vendorProfile is null here, but that's not proof this user has no
  // vendor row - VendorContext's own fetch may simply have failed (see its
  // hasLoadError). Showing the application form in that state risks an
  // already-registered vendor (with real cars/bookings) filling out and
  // submitting a fresh application instead of just reaching their existing
  // account - so this state gets its own explicit retry, not the form.
  if (hasLoadError) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.disabled} />
        <Text style={styles.errorText}>
          Couldn't confirm whether you're already registered as a vendor. Check your connection and try again.
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleCheckExistingStatus} disabled={isCheckingStatus}>
          <Text style={styles.retryButtonText}>{isCheckingStatus ? 'Checking…' : 'Retry'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* router.replace(), not router.back() - this screen is pushed from
          app/(tabs)/profile.js's switchToHostMode(), a tab root inside the
          root (tabs) group, to this root-Stack sibling - the exact
          combination that leaves a bare back()/GO_BACK unresolved
          elsewhere in this app (see app/inbox/index.js's matching fix -
          canGoBack() isn't a safe guard either, it reports true even in
          the broken state). */}
      <VendorHeader title="Become a Vendor" subtitle="Quick application to start listing your car" onBack={() => router.replace('/(tabs)/profile')} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={handleCheckExistingStatus} disabled={isCheckingStatus} style={styles.alreadyVendorRow}>
            <Text style={styles.alreadyVendorText}>
              {isCheckingStatus ? 'Checking your account…' : 'Already registered as a vendor? Tap to check your status'}
            </Text>
          </TouchableOpacity>

          <View style={styles.segmentedRow}>
            <TouchableOpacity
              style={[styles.segment, type === 'individual' && styles.segmentActive]}
              onPress={() => setType('individual')}
            >
              <Text style={[styles.segmentText, type === 'individual' && styles.segmentTextActive]}>Individual</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segment, type === 'business' && styles.segmentActive]}
              onPress={() => setType('business')}
            >
              <Text style={[styles.segmentText, type === 'business' && styles.segmentTextActive]}>Registered Business</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{type === 'individual' ? 'Full Legal Name' : 'Business Name'}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={type === 'individual' ? 'As it appears on your Ghana Card' : 'Registered business name'}
              placeholderTextColor={colors.textSubtle}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Ghana Card Number</Text>
            <TextInput
              style={styles.input}
              value={ghanaCardId}
              onChangeText={setGhanaCardId}
              placeholder="GHA-000000000-0"
              placeholderTextColor={colors.textSubtle}
              autoCapitalize="characters"
            />
            {type === 'business' && (
              <Text style={styles.hint}>Of the person applying on behalf of the business.</Text>
            )}
          </View>

          <Text style={styles.note}>
            You can start listing cars right away. Business registration, tax, and payout details can be added later
            from Vendor Settings.
          </Text>
        </ScrollView>

        <CheckoutFooterButton
          label={isSubmitting ? 'Submitting...' : 'Submit Application'}
          onPress={handleSubmit}
          disabled={!isValid || isSubmitting}
        />
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={showSuccess}
        title="You're a Vendor!"
        message="Your application is in - you can start listing cars right away. Verification shows as pending on your dashboard, but nothing is blocked while you wait."
        confirmLabel="Go to Dashboard"
        cancelLabel={null}
        onConfirm={handleDone}
        onCancel={handleDone}
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
    flex: {
      flex: 1,
    },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      gap: 12,
      paddingHorizontal: 32,
    },
    errorText: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textSubtle,
      textAlign: 'center',
      lineHeight: 20,
    },
    retryButton: {
      backgroundColor: colors.teal,
      borderRadius: 12,
      paddingHorizontal: 24,
      paddingVertical: 13,
      marginTop: 4,
    },
    retryButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 14,
    },
    alreadyVendorRow: {
      alignItems: 'center',
      paddingVertical: 10,
      marginBottom: 14,
    },
    alreadyVendorText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.teal,
      textAlign: 'center',
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    segmentedRow: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 4,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segment: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 9,
      alignItems: 'center',
    },
    segmentActive: {
      backgroundColor: colors.teal,
    },
    segmentText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textMuted,
    },
    segmentTextActive: {
      color: colors.white,
    },
    field: {
      marginBottom: 18,
    },
    label: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
      marginBottom: 8,
    },
    hint: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
      marginTop: 6,
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textPrimary,
    },
    note: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      lineHeight: 18,
      marginTop: 4,
    },
  });
}
