import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useVendor } from '../../contexts/VendorContext';
import VendorHeader from '../../components/VendorHeader';
import CheckoutFooterButton from '../../components/CheckoutFooterButton';

export default function VendorBusinessInfoScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { isLoading, vendorProfile, saveVendorProfile } = useVendor();

  const [type, setType] = useState('individual');
  const [legalName, setLegalName] = useState('');
  const [ghanaCardNumber, setGhanaCardNumber] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [tin, setTin] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isInitialized || isLoading) return;
    const saved = vendorProfile?.businessInfo;
    setType(saved?.type ?? 'individual');
    setLegalName(saved?.legalName ?? user?.name ?? '');
    setGhanaCardNumber(saved?.ghanaCardNumber ?? '');
    setBusinessName(saved?.businessName ?? '');
    setRegistrationNumber(saved?.registrationNumber ?? '');
    setTin(saved?.tin ?? '');
    setBusinessAddress(saved?.businessAddress ?? '');
    setIsInitialized(true);
  }, [isLoading, isInitialized, vendorProfile?.businessInfo, user?.name]);

  const isValid = type === 'individual'
    ? legalName.trim().length > 0 && ghanaCardNumber.trim().length > 0
    : businessName.trim().length > 0 && registrationNumber.trim().length > 0 && tin.trim().length > 0 && businessAddress.trim().length > 0;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveVendorProfile({
        businessInfo: type === 'individual'
          ? { type, legalName: legalName.trim(), ghanaCardNumber: ghanaCardNumber.trim() }
          : {
            type,
            businessName: businessName.trim(),
            registrationNumber: registrationNumber.trim(),
            tin: tin.trim(),
            businessAddress: businessAddress.trim(),
          },
      });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch (e) {
      Alert.alert('Could not save', e?.message || 'Please check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !isInitialized) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <VendorHeader title="Business & Tax Information" subtitle="Registration and tax details for payouts" onBack={() => router.back()} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {justSaved && (
            <View style={styles.savedBanner}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.savedBannerText}>Saved</Text>
            </View>
          )}

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

          {type === 'individual' ? (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Full Legal Name</Text>
                <TextInput
                  style={styles.input}
                  value={legalName}
                  onChangeText={setLegalName}
                  placeholder="As it appears on your Ghana Card"
                  placeholderTextColor={colors.textSubtle}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Ghana Card Number</Text>
                <TextInput
                  style={styles.input}
                  value={ghanaCardNumber}
                  onChangeText={setGhanaCardNumber}
                  placeholder="GHA-000000000-0"
                  placeholderTextColor={colors.textSubtle}
                  autoCapitalize="characters"
                />
              </View>
            </>
          ) : (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Business Name</Text>
                <TextInput
                  style={styles.input}
                  value={businessName}
                  onChangeText={setBusinessName}
                  placeholder="Registered business name"
                  placeholderTextColor={colors.textSubtle}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>RGD Business Registration Number</Text>
                <TextInput
                  style={styles.input}
                  value={registrationNumber}
                  onChangeText={setRegistrationNumber}
                  placeholder="e.g. BN1234567890"
                  placeholderTextColor={colors.textSubtle}
                  autoCapitalize="characters"
                />
                <Text style={styles.hint}>From the Registrar General's Department.</Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>GRA Tax Identification Number (TIN)</Text>
                <TextInput
                  style={styles.input}
                  value={tin}
                  onChangeText={setTin}
                  placeholder="e.g. C0012345678"
                  placeholderTextColor={colors.textSubtle}
                  autoCapitalize="characters"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Business Address</Text>
                <TextInput
                  style={styles.input}
                  value={businessAddress}
                  onChangeText={setBusinessAddress}
                  placeholder="Registered business address"
                  placeholderTextColor={colors.textSubtle}
                />
              </View>
            </>
          )}
        </ScrollView>

        <CheckoutFooterButton label={isSaving ? 'Saving...' : 'Save'} onPress={handleSave} disabled={!isValid || isSaving} />
      </KeyboardAvoidingView>
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
    savedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.successBg,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginBottom: 16,
      alignSelf: 'flex-start',
    },
    savedBannerText: {
      fontFamily: FONTS.semiBold,
      fontSize: 12,
      color: colors.success,
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
  });
}
