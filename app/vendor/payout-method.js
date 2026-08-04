import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useVendor } from '../../contexts/VendorContext';
import VendorHeader from '../../components/VendorHeader';
import CheckoutFooterButton from '../../components/CheckoutFooterButton';
import SearchableOptionModal from '../../components/SearchableOptionModal';

// Real Ghanaian mobile money networks and commercial banks - matches the
// "Mobile Money" / "Bank Transfer" methods payouts-guide.js already commits
// to, so this screen isn't introducing a payment rail that guide doesn't
// mention.
const MOBILE_NETWORKS = ['MTN Mobile Money', 'Vodafone Cash', 'AirtelTigo Money'];

const GHANA_BANKS = [
  'GCB Bank', 'Ecobank Ghana', 'Absa Bank Ghana', 'Stanbic Bank Ghana', 'Fidelity Bank Ghana',
  'CalBank', 'Zenith Bank Ghana', 'Access Bank Ghana', 'Standard Chartered Ghana',
  'Republic Bank Ghana', 'UBA Ghana', 'Societe Generale Ghana', 'First National Bank Ghana',
  'First Atlantic Bank', 'Agricultural Development Bank', 'National Investment Bank',
  'Prudential Bank', 'GT Bank Ghana', 'Consolidated Bank Ghana', 'OmniBSIC Bank',
];

function maskAccountNumber(number) {
  const digits = String(number).replace(/\s/g, '');
  if (digits.length <= 4) return digits;
  return `•••• ${digits.slice(-4)}`;
}

function PickerField({ label, value, placeholder, onPress, styles, colors }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.pickerButton} onPress={onPress}>
        <Text style={[styles.pickerButtonText, !value && styles.pickerButtonPlaceholder]}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSubtle} />
      </TouchableOpacity>
    </View>
  );
}

export default function VendorPayoutMethodScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isLoading, vendorProfile, saveVendorProfile } = useVendor();

  const [type, setType] = useState('mobile_money');
  const [network, setNetwork] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(null); // 'network' | 'bank' | null

  // VendorContext loads asynchronously - seed neutral defaults and copy the
  // real saved method in once it's available, same pattern used to fix the
  // Edit Listing screen's cold-load race condition.
  useEffect(() => {
    if (isInitialized || isLoading) return;
    const saved = vendorProfile?.payoutMethod;
    if (saved?.type) {
      setType(saved.type ?? 'mobile_money');
      setNetwork(saved.network ?? '');
      setPhoneNumber(saved.phoneNumber ?? '');
      setBankName(saved.bankName ?? '');
      setAccountNumber(saved.accountNumber ?? '');
      setAccountName(saved.accountName ?? '');
    } else {
      setIsEditing(true);
    }
    setIsInitialized(true);
  }, [isLoading, isInitialized, vendorProfile?.payoutMethod]);

  const isValid = type === 'mobile_money'
    ? !!network && phoneNumber.replace(/\D/g, '').length >= 9
    : !!bankName && accountNumber.replace(/\D/g, '').length >= 8 && !!accountName.trim();

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveVendorProfile({
        payoutMethod: type === 'mobile_money'
          ? { type, network, phoneNumber: phoneNumber.trim() }
          : { type, bankName, accountNumber: accountNumber.trim(), accountName: accountName.trim() },
      });
      setIsEditing(false);
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

  const saved = vendorProfile?.payoutMethod?.type ? vendorProfile.payoutMethod : null;

  return (
    <View style={styles.container}>
      <VendorHeader title="Payout Method" subtitle="How you get paid for completed bookings" onBack={() => router.back()} />

      {!isEditing && saved ? (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.payoutCard}>
            <View style={styles.payoutCardTop}>
              <Ionicons
                name={saved.type === 'mobile_money' ? 'phone-portrait-outline' : 'business-outline'}
                size={26}
                color={colors.white}
              />
              <Text style={styles.payoutCardType}>
                {saved.type === 'mobile_money' ? 'Mobile Money' : 'Bank Transfer'}
              </Text>
            </View>
            {saved.type === 'mobile_money' ? (
              <>
                <Text style={styles.payoutCardNumber}>{maskAccountNumber(saved.phoneNumber)}</Text>
                <Text style={styles.payoutCardName}>{saved.network}</Text>
              </>
            ) : (
              <>
                <Text style={styles.payoutCardNumber}>{maskAccountNumber(saved.accountNumber)}</Text>
                <Text style={styles.payoutCardName}>{saved.accountName} · {saved.bankName}</Text>
              </>
            )}
          </View>

          <TouchableOpacity style={styles.editButton} onPress={() => setIsEditing(true)}>
            <Ionicons name="create-outline" size={18} color={colors.teal} />
            <Text style={styles.editButtonText}>Edit Payout Method</Text>
          </TouchableOpacity>

          <View style={styles.disclaimer}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textSubtle} />
            <Text style={styles.disclaimerText}>
              Your payout schedule and fee rate are set out in your Vendor Agreement.
            </Text>
          </View>
        </ScrollView>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.segmentedRow}>
              <TouchableOpacity
                style={[styles.segment, type === 'mobile_money' && styles.segmentActive]}
                onPress={() => setType('mobile_money')}
              >
                <Text style={[styles.segmentText, type === 'mobile_money' && styles.segmentTextActive]}>Mobile Money</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segment, type === 'bank' && styles.segmentActive]}
                onPress={() => setType('bank')}
              >
                <Text style={[styles.segmentText, type === 'bank' && styles.segmentTextActive]}>Bank Transfer</Text>
              </TouchableOpacity>
            </View>

            {type === 'mobile_money' ? (
              <>
                <PickerField
                  label="Network"
                  value={network}
                  placeholder="Select network"
                  onPress={() => setPickerOpen('network')}
                  styles={styles}
                  colors={colors}
                />
                <View style={styles.field}>
                  <Text style={styles.label}>Mobile Money Number</Text>
                  <TextInput
                    style={styles.input}
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    placeholder="e.g. 024 123 4567"
                    placeholderTextColor={colors.textSubtle}
                    keyboardType="phone-pad"
                  />
                </View>
              </>
            ) : (
              <>
                <PickerField
                  label="Bank"
                  value={bankName}
                  placeholder="Select bank"
                  onPress={() => setPickerOpen('bank')}
                  styles={styles}
                  colors={colors}
                />
                <View style={styles.field}>
                  <Text style={styles.label}>Account Number</Text>
                  <TextInput
                    style={styles.input}
                    value={accountNumber}
                    onChangeText={setAccountNumber}
                    placeholder="e.g. 1234567890"
                    placeholderTextColor={colors.textSubtle}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Account Holder Name</Text>
                  <TextInput
                    style={styles.input}
                    value={accountName}
                    onChangeText={setAccountName}
                    placeholder="Name on the account"
                    placeholderTextColor={colors.textSubtle}
                  />
                </View>
              </>
            )}

            {saved && (
              <TouchableOpacity style={styles.cancelButton} onPress={() => setIsEditing(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          <CheckoutFooterButton label={isSaving ? 'Saving...' : 'Save Payout Method'} onPress={handleSave} disabled={!isValid || isSaving} />
        </KeyboardAvoidingView>
      )}

      <SearchableOptionModal
        visible={pickerOpen === 'network'}
        title="Select Network"
        options={MOBILE_NETWORKS}
        value={network}
        onSelect={setNetwork}
        onClose={() => setPickerOpen(null)}
      />
      <SearchableOptionModal
        visible={pickerOpen === 'bank'}
        title="Select Bank"
        options={GHANA_BANKS}
        value={bankName}
        onSelect={setBankName}
        onClose={() => setPickerOpen(null)}
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
    payoutCard: {
      backgroundColor: colors.navy,
      borderRadius: 18,
      padding: 20,
      marginBottom: 16,
    },
    payoutCardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 24,
    },
    payoutCardType: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: 'rgba(255,255,255,0.85)',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    payoutCardNumber: {
      fontFamily: FONTS.bold,
      fontSize: 22,
      color: colors.white,
      letterSpacing: 1,
      marginBottom: 6,
    },
    payoutCardName: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: 'rgba(255,255,255,0.75)',
    },
    editButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    editButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.teal,
    },
    disclaimer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 20,
    },
    disclaimerText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
      lineHeight: 16,
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
    pickerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    pickerButtonText: {
      fontFamily: FONTS.medium,
      fontSize: 14,
      color: colors.textPrimary,
    },
    pickerButtonPlaceholder: {
      fontFamily: FONTS.regular,
      color: colors.textSubtle,
    },
    cancelButton: {
      alignSelf: 'center',
      marginTop: 4,
    },
    cancelButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textSubtle,
    },
  });
}
