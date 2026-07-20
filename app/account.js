import { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator,
  Image, ScrollView, Alert, Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';

const VERIFICATION_COLORS = {
  verified: { bg: '#E8F5E9', text: '#2E7D32', label: 'Verified' },
  pending: { bg: '#FFF3E0', text: '#E65100', label: 'Pending' },
  expired: { bg: '#FFEBEE', text: '#C62828', label: 'Expired' },
};

function formatMemberSince(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, badge }) {
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
        placeholderTextColor="#999"
        keyboardType={keyboardType}
        autoCapitalize="none"
      />
    </View>
  );
}

function VerifiedBadge({ verified }) {
  const style = verified ? VERIFICATION_COLORS.verified : VERIFICATION_COLORS.pending;
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
  preferredPickupLocation: '', emergencyContactName: '', emergencyContactPhone: '',
};

export default function AccountScreen() {
  const router = useRouter();
  const { user, isLoading, logout, updateProfile, uploadAvatar } = useAuth();

  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, user]);

  useEffect(() => {
    if (!user) return;
    setForm({
      firstName: user.firstName, lastName: user.lastName, nickname: user.nickname,
      email: user.email, phone: user.phone, birthday: user.birthday ?? '',
      address: user.address, city: user.city, country: user.country,
      driverLicenseNumber: '', driverLicenseExpiry: user.driverLicenseExpiry ?? '',
      driverLicenseCountry: user.driverLicenseCountry,
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
    if (form.email !== user.email) payload.email = form.email;
    if (form.phone !== user.phone) payload.phone = form.phone;
    if (form.birthday !== (user.birthday ?? '')) payload.birthday = form.birthday;
    if (form.address !== user.address) payload.address = form.address;
    if (form.city !== user.city) payload.city = form.city;
    if (form.country !== user.country) payload.country = form.country;
    if (form.driverLicenseNumber.trim()) payload.driver_license_number = form.driverLicenseNumber;
    if (form.driverLicenseExpiry !== (user.driverLicenseExpiry ?? '')) payload.driver_license_expiry = form.driverLicenseExpiry;
    if (form.driverLicenseCountry !== user.driverLicenseCountry) payload.driver_license_country = form.driverLicenseCountry;
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
      setForm(prev => ({ ...prev, driverLicenseNumber: '' }));
    } catch (e) {
      setError(e.message || 'Could not save your changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow photo library access to update your photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]) return;

    setIsUploadingAvatar(true);
    setError(null);
    try {
      await uploadAvatar(result.assets[0].uri);
    } catch (e) {
      setError(e.message || 'Could not upload your photo. Please try again.');
    } finally {
      setIsUploadingAvatar(false);
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

  if (isLoading || !user) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={COLORS.teal} />
      </View>
    );
  }

  const verification = VERIFICATION_COLORS[user.licenseVerificationStatus] ?? VERIFICATION_COLORS.pending;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <TouchableOpacity onPress={handlePickAvatar} disabled={isUploadingAvatar} style={styles.avatarWrap}>
            {user.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user.name?.charAt(0)?.toUpperCase() ?? '?'}</Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              {isUploadingAvatar ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Ionicons name="camera" size={14} color="#ffffff" />
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

        <Section title="Personal Info">
          <View style={styles.row}>
            <View style={[styles.field, styles.halfField]}>
              <Text style={styles.fieldLabel}>First Name</Text>
              <TextInput style={styles.input} value={form.firstName} onChangeText={updateField('firstName')} placeholderTextColor="#999" />
            </View>
            <View style={[styles.field, styles.halfField]}>
              <Text style={styles.fieldLabel}>Last Name</Text>
              <TextInput style={styles.input} value={form.lastName} onChangeText={updateField('lastName')} placeholderTextColor="#999" />
            </View>
          </View>
          <Field label="Display Name" value={form.nickname} onChangeText={updateField('nickname')} placeholder="Optional public name" />
          <Field label="Date of Birth" value={form.birthday} onChangeText={updateField('birthday')} placeholder="YYYY-MM-DD" />
        </Section>

        <Section title="Contact">
          <Field
            label="Email Address"
            value={form.email}
            onChangeText={updateField('email')}
            placeholder="you@example.com"
            keyboardType="email-address"
            badge={<VerifiedBadge verified={user.emailVerified} />}
          />
          <Field
            label="Mobile Number"
            value={form.phone}
            onChangeText={updateField('phone')}
            placeholder="Phone number"
            keyboardType="phone-pad"
            badge={<VerifiedBadge verified={user.phoneVerified} />}
          />
          <Text style={styles.hint}>Changing your email or number will require re-verification.</Text>
        </Section>

        <Section title="Address">
          <Field label="Address" value={form.address} onChangeText={updateField('address')} placeholder="Street address" />
          <View style={styles.row}>
            <View style={[styles.field, styles.halfField]}>
              <Text style={styles.fieldLabel}>City</Text>
              <TextInput style={styles.input} value={form.city} onChangeText={updateField('city')} placeholderTextColor="#999" />
            </View>
            <View style={[styles.field, styles.halfField]}>
              <Text style={styles.fieldLabel}>Country</Text>
              <TextInput style={styles.input} value={form.country} onChangeText={updateField('country')} placeholderTextColor="#999" />
            </View>
          </View>
          <Field label="Preferred Pickup Location" value={form.preferredPickupLocation} onChangeText={updateField('preferredPickupLocation')} placeholder="Default pickup city or address" />
        </Section>

        <Section title="Driver's Licence">
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
          />
          <Field label="Expiry Date" value={form.driverLicenseExpiry} onChangeText={updateField('driverLicenseExpiry')} placeholder="YYYY-MM-DD" />
          <Field label="Issuing Country / State" value={form.driverLicenseCountry} onChangeText={updateField('driverLicenseCountry')} placeholder="e.g. Ghana" />
          <Text style={styles.hint}>Your licence number is encrypted and stored securely.</Text>
        </Section>

        <Section title="Emergency Contact">
          <Field label="Contact Name" value={form.emergencyContactName} onChangeText={updateField('emergencyContactName')} placeholder="Optional" />
          <Field label="Contact Phone" value={form.emergencyContactPhone} onChangeText={updateField('emergencyContactPhone')} placeholder="Optional" keyboardType="phone-pad" />
        </Section>

        {!!user.referralCode && (
          <Section title="Referral Code">
            <View style={styles.referralRow}>
              <Text style={styles.referralCode}>{user.referralCode}</Text>
              <TouchableOpacity style={styles.shareButton} onPress={handleShareReferral}>
                <Ionicons name="share-social-outline" size={16} color={COLORS.teal} />
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
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutButton} onPress={logout}>
          <Text style={styles.signOutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centerState: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
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
    backgroundColor: COLORS.teal,
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
    color: '#ffffff',
  },
  avatarEditBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  name: {
    fontFamily: FONTS.bold,
    fontSize: 19,
    color: COLORS.navy,
  },
  memberSince: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#888',
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
    backgroundColor: '#eee',
    overflow: 'hidden',
  },
  completionFill: {
    height: '100%',
    backgroundColor: COLORS.teal,
    borderRadius: 3,
  },
  completionLabel: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: '#888',
  },
  errorText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#C62828',
    backgroundColor: '#FFEBEE',
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
    color: COLORS.navy,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
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
    color: COLORS.navy,
  },
  input: {
    fontFamily: FONTS.regular,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  hint: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#999',
    marginTop: -6,
    marginBottom: 8,
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
    color: COLORS.navy,
    letterSpacing: 2,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.teal,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  shareButtonText: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: COLORS.teal,
  },
  saveButton: {
    backgroundColor: COLORS.teal,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    fontFamily: FONTS.semiBold,
    color: '#ffffff',
    fontSize: 16,
  },
  signOutButton: {
    borderWidth: 1,
    borderColor: '#C62828',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  signOutButtonText: {
    fontFamily: FONTS.semiBold,
    color: '#C62828',
    fontSize: 15,
  },
});
