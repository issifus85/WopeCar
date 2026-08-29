import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator,
  ScrollView, Alert, Share, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { uploadDocument } from '../services/documentsApi';
import { pickImage } from '../services/imagePicker';
import OptionPickerModal from '../components/OptionPickerModal';
import PhotoSourceSheet from '../components/PhotoSourceSheet';

function getVerificationColors(colors) {
  return {
    verified: { bg: colors.successBg, text: colors.success, label: 'Verified' },
    pending: { bg: colors.warningBg, text: colors.warning, label: 'Pending' },
    expired: { bg: colors.errorBg, text: colors.error, label: 'Expired' },
    rejected: { bg: colors.errorBg, text: colors.error, label: 'Rejected' },
  };
}

const NATIONAL_ID_TYPE_LABELS = { ghana_card: 'Ghana Card', passport: 'Passport', voter_id: "Voter's ID" };
const NATIONAL_ID_TYPE_OPTIONS = Object.values(NATIONAL_ID_TYPE_LABELS);
function nationalIdTypeToLabel(type) { return NATIONAL_ID_TYPE_LABELS[type] ?? ''; }
function nationalIdLabelToType(label) {
  return Object.keys(NATIONAL_ID_TYPE_LABELS).find((key) => NATIONAL_ID_TYPE_LABELS[key] === label) ?? '';
}

function formatMemberSince(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function Section({ title, children, styles }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, badge, styles, colors }) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {badge}
      </View>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        keyboardType={keyboardType}
        autoCapitalize="none"
      />
    </View>
  );
}

function VerifiedBadge({ verified, styles, colors }) {
  const verificationColors = getVerificationColors(colors);
  const style = verified ? verificationColors.verified : verificationColors.pending;
  return (
    <View style={[styles.badge, { backgroundColor: style.bg }]}>
      <Text style={[styles.badgeText, { color: style.text }]}>
        {verified ? 'Verified' : 'Not verified'}
      </Text>
    </View>
  );
}

const EMPTY_FORM = {
  firstName: '', lastName: '', nickname: '', email: '', phone: '', birthday: '',
  address: '', city: '', country: '',
  driverLicenseNumber: '', driverLicenseExpiry: '', driverLicenseCountry: '',
  nationalIdType: '', nationalIdNumber: '', nationalIdExpiry: '',
  preferredPickupLocation: '', emergencyContactName: '', emergencyContactPhone: '',
};

export default function AccountScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { from } = useLocalSearchParams();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, isLoading, logout, updateProfile, uploadAvatar } = useAuth();

  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [error, setError] = useState(null);
  const [photoPickerTarget, setPhotoPickerTarget] = useState(null); // 'avatar' | 'nationalId' | null - which upload opened the Take Photo/Choose from Library sheet
  const [isIdTypePickerVisible, setIsIdTypePickerVisible] = useState(false);
  const [isUploadingIdDoc, setIsUploadingIdDoc] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, user]);

  // This screen is reached from two different places (Profile's account row
  // and three Settings rows), both pushed from inside the (tabs)/settings
  // nested navigators - the same GO_BACK-unresolved-on-web issue documented
  // for booking/[id].js and protection-plan.js applies here too, so this
  // uses the same custom-headerLeft/router.replace fix instead of the
  // default back button. `from` (set by the Settings call sites) picks the
  // right destination; Profile's own call site omits it since that's the
  // default.
  const handleBack = useCallback(() => {
    router.replace(from === 'settings' ? '/settings' : '/(tabs)/profile');
  }, [router, from]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={handleBack} hitSlop={10} style={styles.headerBackButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          <Text style={styles.headerBackLabel}>{from === 'settings' ? 'Settings' : 'Account'}</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleBack, styles, colors, from]);

  useEffect(() => {
    if (!user) return;
    setForm({
      firstName: user.firstName, lastName: user.lastName, nickname: user.nickname,
      email: user.email, phone: user.phone, birthday: user.birthday ?? '',
      address: user.address, city: user.city, country: user.country,
      driverLicenseNumber: '', driverLicenseExpiry: user.driverLicenseExpiry ?? '',
      driverLicenseCountry: user.driverLicenseCountry,
      nationalIdType: nationalIdTypeToLabel(user.nationalIdType), nationalIdNumber: '',
      nationalIdExpiry: user.nationalIdExpiry ?? '',
      preferredPickupLocation: user.preferredPickupLocation,
      emergencyContactName: user.emergencyContactName,
      emergencyContactPhone: user.emergencyContactPhone,
    });
  }, [user]);

  const updateField = (key) => (value) => setForm(prev => ({ ...prev, [key]: value }));

  const dirtyPayload = useMemo(() => {
    if (!user) return {};
    const payload = {};
    if (form.firstName !== user.firstName) payload.first_name = form.firstName;
    if (form.lastName !== user.lastName) payload.last_name = form.lastName;
    if (form.nickname !== user.nickname) payload.nickname = form.nickname;
    // full_name is a separate column (predates first_name/last_name - see
    // 0005_extend_users_profile.sql) that the Account screen header, the
    // admin dashboard, and other screens all display - keep it in sync
    // whenever either name part changes, or it silently goes stale.
    if (payload.first_name !== undefined || payload.last_name !== undefined) {
      const nextFullName = `${form.firstName || ''} ${form.lastName || ''}`.trim();
      if (nextFullName && nextFullName !== user.name) payload.full_name = nextFullName;
    }
    if (form.email !== user.email) payload.email = form.email;
    if (form.phone !== user.phone) payload.phone = form.phone;
    if (form.birthday !== (user.birthday ?? '')) payload.birthday = form.birthday;
    if (form.address !== user.address) payload.address = form.address;
    if (form.city !== user.city) payload.city = form.city;
    if (form.country !== user.country) payload.country = form.country;
    if (form.driverLicenseNumber.trim()) payload.driver_license_number = form.driverLicenseNumber;
    if (form.driverLicenseExpiry !== (user.driverLicenseExpiry ?? '')) payload.driver_license_expiry = form.driverLicenseExpiry;
    if (form.driverLicenseCountry !== user.driverLicenseCountry) payload.driver_license_country = form.driverLicenseCountry;
    if (form.nationalIdType !== nationalIdTypeToLabel(user.nationalIdType)) payload.national_id_type = nationalIdLabelToType(form.nationalIdType) || null;
    if (form.nationalIdNumber.trim()) payload.national_id_number = form.nationalIdNumber;
    if (form.nationalIdExpiry !== (user.nationalIdExpiry ?? '')) payload.national_id_expiry = form.nationalIdExpiry || null;
    if (form.preferredPickupLocation !== user.preferredPickupLocation) payload.preferred_pickup_location = form.preferredPickupLocation;
    if (form.emergencyContactName !== user.emergencyContactName) payload.emergency_contact_name = form.emergencyContactName;
    if (form.emergencyContactPhone !== user.emergencyContactPhone) payload.emergency_contact_phone = form.emergencyContactPhone;
    return payload;
  }, [form, user]);

  const hasChanges = Object.keys(dirtyPayload).length > 0;

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      await updateProfile(dirtyPayload);
      setForm(prev => ({ ...prev, driverLicenseNumber: '', nationalIdNumber: '' }));
    } catch (e) {
      setError(e.message || 'Could not save your changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePickAvatar = () => {
    if (photoPickerTarget || isUploadingAvatar) return;
    setPhotoPickerTarget('avatar');
  };

  const handleUploadIdDocument = () => {
    if (photoPickerTarget || isUploadingIdDoc) return;
    setPhotoPickerTarget('nationalId');
  };

  const handlePickSource = async (source) => {
    const target = photoPickerTarget;
    setPhotoPickerTarget(null);
    if (!target) return;

    let uri;
    try {
      uri = await pickImage(source, target === 'avatar' ? { allowsEditing: true, aspect: [1, 1] } : undefined);
    } catch (e) {
      Alert.alert(source === 'camera' ? 'Could not open camera' : 'Could not open photo library', e.message || 'Please try again.');
      return;
    }
    if (!uri) return;

    if (target === 'avatar') {
      setIsUploadingAvatar(true);
      setError(null);
      try {
        await uploadAvatar(uri);
      } catch (e) {
        setError(e.message || 'Could not upload your photo. Please try again.');
      } finally {
        setIsUploadingAvatar(false);
      }
    } else {
      setIsUploadingIdDoc(true);
      try {
        await uploadDocument('national_id', uri);
      } catch (e) {
        Alert.alert('Could not upload your ID', e.message || 'Please try again.');
      } finally {
        setIsUploadingIdDoc(false);
      }
    }
  };

  const handleShareReferral = async () => {
    if (!user?.referralCode) return;
    try {
      await Share.share({
        message: `Join me on WopeCar and start renting cars in Accra! Use my referral code ${user.referralCode} when you sign up.`,
      });
    } catch {
      // user dismissed the share sheet - nothing to do
    }
  };

  // Deliberately not `isLoading || !user` - AuthContext's refresh() flips
  // isLoading back to true on every SIGNED_IN/USER_UPDATED auth event (e.g.
  // saving an email change here fires USER_UPDATED), not just on first
  // mount. Gating on isLoading meant any background refresh mid-session
  // wiped this whole screen back to a bare spinner while the user was
  // sitting on it - looked exactly like the screen "going unresponsive".
  // `user` itself keeps its last value during a refresh (only replaced once
  // the new fetch resolves), so gating on it alone still shows the spinner
  // correctly before the first load / while genuinely logged out, without
  // interrupting an already-rendered screen.
  if (!user) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  const verificationColors = getVerificationColors(colors);
  const verification = verificationColors[user.licenseVerificationStatus] ?? verificationColors.pending;
  const nationalIdVerification = verificationColors[user.nationalIdStatus] ?? verificationColors.pending;

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <TouchableOpacity onPress={handlePickAvatar} disabled={isUploadingAvatar || !!photoPickerTarget} style={styles.avatarWrap}>
            {user.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user.name?.charAt(0)?.toUpperCase() ?? '?'}</Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              {isUploadingAvatar ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="camera" size={14} color={colors.white} />
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.memberSince}>Member since {formatMemberSince(user.memberSince)}</Text>

          <View style={styles.completionRow}>
            <View style={styles.completionTrack}>
              <View style={[styles.completionFill, { width: `${user.profileCompletion}%` }]} />
            </View>
            <Text style={styles.completionLabel}>{user.profileCompletion}% complete</Text>
          </View>
        </View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <Section title="Personal Info" styles={styles}>
          <View style={styles.row}>
            <View style={[styles.field, styles.halfField]}>
              <Text style={styles.fieldLabel}>First Name</Text>
              <TextInput style={styles.input} value={form.firstName} onChangeText={updateField('firstName')} placeholderTextColor={colors.textSubtle} />
            </View>
            <View style={[styles.field, styles.halfField]}>
              <Text style={styles.fieldLabel}>Last Name</Text>
              <TextInput style={styles.input} value={form.lastName} onChangeText={updateField('lastName')} placeholderTextColor={colors.textSubtle} />
            </View>
          </View>
          <Field label="Display Name" value={form.nickname} onChangeText={updateField('nickname')} placeholder="Optional public name" styles={styles} colors={colors} />
          <Field label="Date of Birth" value={form.birthday} onChangeText={updateField('birthday')} placeholder="YYYY-MM-DD" styles={styles} colors={colors} />
        </Section>

        <Section title="Contact" styles={styles}>
          <Field
            label="Email Address"
            value={form.email}
            onChangeText={updateField('email')}
            placeholder="you@example.com"
            keyboardType="email-address"
            badge={<VerifiedBadge verified={user.emailVerified} styles={styles} colors={colors} />}
            styles={styles}
            colors={colors}
          />
          <Field
            label="Mobile Number"
            value={form.phone}
            onChangeText={updateField('phone')}
            placeholder="Phone number"
            keyboardType="phone-pad"
            badge={<VerifiedBadge verified={user.phoneVerified} styles={styles} colors={colors} />}
            styles={styles}
            colors={colors}
          />
          <Text style={styles.hint}>Changing your email or number will require re-verification.</Text>
        </Section>

        <Section title="Address" styles={styles}>
          <Field label="Address" value={form.address} onChangeText={updateField('address')} placeholder="Street address" styles={styles} colors={colors} />
          <View style={styles.row}>
            <View style={[styles.field, styles.halfField]}>
              <Text style={styles.fieldLabel}>City</Text>
              <TextInput style={styles.input} value={form.city} onChangeText={updateField('city')} placeholderTextColor={colors.textSubtle} />
            </View>
            <View style={[styles.field, styles.halfField]}>
              <Text style={styles.fieldLabel}>Country</Text>
              <TextInput style={styles.input} value={form.country} onChangeText={updateField('country')} placeholderTextColor={colors.textSubtle} />
            </View>
          </View>
          <Field label="Preferred Pickup Location" value={form.preferredPickupLocation} onChangeText={updateField('preferredPickupLocation')} placeholder="Default pickup city or address" styles={styles} colors={colors} />
        </Section>

        <Section title="Driver's Licence" styles={styles}>
          <View style={styles.fieldLabelRow}>
            <Text style={styles.fieldLabel}>Verification Status</Text>
            <View style={[styles.badge, { backgroundColor: verification.bg }]}>
              <Text style={[styles.badgeText, { color: verification.text }]}>{verification.label}</Text>
            </View>
          </View>
          {!!user.driverLicenseNumberMasked && (
            <Text style={styles.hint}>On file: {user.driverLicenseNumberMasked}</Text>
          )}
          <Field
            label={user.driverLicenseNumberMasked ? 'Replace Licence Number' : 'Licence Number'}
            value={form.driverLicenseNumber}
            onChangeText={updateField('driverLicenseNumber')}
            placeholder="Driver's licence number"
            styles={styles}
            colors={colors}
          />
          <Field label="Expiry Date" value={form.driverLicenseExpiry} onChangeText={updateField('driverLicenseExpiry')} placeholder="YYYY-MM-DD" styles={styles} colors={colors} />
          <Field label="Issuing Country / State" value={form.driverLicenseCountry} onChangeText={updateField('driverLicenseCountry')} placeholder="e.g. Ghana" styles={styles} colors={colors} />
          <Text style={styles.hint}>Your licence number is encrypted and stored securely.</Text>
        </Section>

        <Section title="National / Government ID" styles={styles}>
          <View style={styles.fieldLabelRow}>
            <Text style={styles.fieldLabel}>Verification Status</Text>
            <View style={[styles.badge, { backgroundColor: nationalIdVerification.bg }]}>
              <Text style={[styles.badgeText, { color: nationalIdVerification.text }]}>{nationalIdVerification.label}</Text>
            </View>
          </View>
          {user.nationalIdStatus === 'rejected' && !!user.nationalIdRejectionReason && (
            <Text style={[styles.hint, { color: colors.error }]}>{user.nationalIdRejectionReason}</Text>
          )}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>ID Type</Text>
            <TouchableOpacity style={styles.input} onPress={() => setIsIdTypePickerVisible(true)}>
              <Text style={form.nationalIdType ? styles.pickerValueText : styles.pickerPlaceholderText}>
                {form.nationalIdType || 'Select ID type'}
              </Text>
            </TouchableOpacity>
          </View>
          {!!user.nationalIdNumberMasked && (
            <Text style={styles.hint}>On file: {user.nationalIdNumberMasked}</Text>
          )}
          <Field
            label={user.nationalIdNumberMasked ? 'Replace ID Number' : 'ID Number'}
            value={form.nationalIdNumber}
            onChangeText={updateField('nationalIdNumber')}
            placeholder="National/government ID number"
            styles={styles}
            colors={colors}
          />
          <Field label="Expiry Date" value={form.nationalIdExpiry} onChangeText={updateField('nationalIdExpiry')} placeholder="YYYY-MM-DD" styles={styles} colors={colors} />
          <TouchableOpacity style={styles.uploadButton} onPress={handleUploadIdDocument} disabled={isUploadingIdDoc || !!photoPickerTarget}>
            {isUploadingIdDoc ? (
              <ActivityIndicator size="small" color={colors.teal} />
            ) : (
              <Ionicons name="cloud-upload-outline" size={16} color={colors.teal} />
            )}
            <Text style={styles.uploadButtonText}>Upload ID Copy</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>This is accessible to admin for identity verification.</Text>
        </Section>

        <Section title="Emergency Contact" styles={styles}>
          <Field label="Contact Name" value={form.emergencyContactName} onChangeText={updateField('emergencyContactName')} placeholder="Optional" styles={styles} colors={colors} />
          <Field label="Contact Phone" value={form.emergencyContactPhone} onChangeText={updateField('emergencyContactPhone')} placeholder="Optional" keyboardType="phone-pad" styles={styles} colors={colors} />
        </Section>

        {!!user.referralCode && (
          <Section title="Referral Code" styles={styles}>
            <View style={styles.referralRow}>
              <Text style={styles.referralCode}>{user.referralCode}</Text>
              <TouchableOpacity style={styles.shareButton} onPress={handleShareReferral}>
                <Ionicons name="share-social-outline" size={16} color={colors.teal} />
                <Text style={styles.shareButtonText}>Share</Text>
              </TouchableOpacity>
            </View>
          </Section>
        )}

        <TouchableOpacity
          style={[styles.saveButton, (!hasChanges || isSaving) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!hasChanges || isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutButton} onPress={logout}>
          <Text style={styles.signOutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>

      <PhotoSourceSheet
        visible={!!photoPickerTarget}
        title={photoPickerTarget === 'avatar' ? 'Update Profile Photo' : 'Upload ID Copy'}
        onClose={() => setPhotoPickerTarget(null)}
        onChooseCamera={() => handlePickSource('camera')}
        onChooseLibrary={() => handlePickSource('library')}
      />

      <OptionPickerModal
        visible={isIdTypePickerVisible}
        title="ID Type"
        options={NATIONAL_ID_TYPE_OPTIONS}
        value={form.nationalIdType}
        onSelect={updateField('nationalIdType')}
        onClose={() => setIsIdTypePickerVisible(false)}
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
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centerState: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarWrap: {
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarText: {
    fontFamily: FONTS.bold,
    fontSize: 30,
    color: colors.white,
  },
  avatarEditBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  name: {
    fontFamily: FONTS.bold,
    fontSize: 19,
    color: colors.textPrimary,
  },
  memberSince: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: colors.textSubtle,
    marginTop: 2,
    marginBottom: 14,
  },
  completionRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  completionTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.divider,
    overflow: 'hidden',
  },
  completionFill: {
    height: '100%',
    backgroundColor: colors.teal,
    borderRadius: 3,
  },
  completionLabel: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: colors.textSubtle,
  },
  errorText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: colors.error,
    backgroundColor: colors.errorBg,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  field: {
    marginBottom: 14,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  fieldLabel: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  input: {
    fontFamily: FONTS.regular,
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
  hint: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: colors.textSubtle,
    marginTop: -6,
    marginBottom: 8,
  },
  pickerValueText: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  pickerPlaceholderText: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: colors.textSubtle,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.teal,
    borderRadius: 10,
    paddingVertical: 11,
    marginBottom: 8,
  },
  uploadButtonText: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: colors.teal,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontFamily: FONTS.semiBold,
    fontSize: 10,
  },
  referralRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  referralCode: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: colors.textPrimary,
    letterSpacing: 2,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.teal,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  shareButtonText: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: colors.teal,
  },
  saveButton: {
    backgroundColor: colors.teal,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  saveButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  saveButtonText: {
    fontFamily: FONTS.semiBold,
    color: colors.white,
    fontSize: 16,
  },
  signOutButton: {
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  signOutButtonText: {
    fontFamily: FONTS.semiBold,
    color: colors.error,
    fontSize: 15,
  },
  });
}
