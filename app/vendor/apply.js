import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useVendor } from '../../contexts/VendorContext';
import { applyToBecomeVendor } from '../../services/vendorCarsApi';
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
  const { vendorProfile, isLoading: isVendorLoading, refreshVendorProfile } = useVendor();

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

  const [type, setType] = useState('individual');
  const [name, setName] = useState(user?.name ?? '');
  const [ghanaCardId, setGhanaCardId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const isValid = name.trim().length > 0 && ghanaCardId.trim().length > 0;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await applyToBecomeVendor({
        businessName: name.trim(),
        ghanaCardId: ghanaCardId.trim(),
      });
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

  return (
    <View style={styles.container}>
      <VendorHeader title="Become a Vendor" subtitle="Quick application to start listing your car" onBack={() => router.back()} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
