import { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Image, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useCheckout } from '../../contexts/CheckoutContext';
import CheckoutHeader from '../../components/CheckoutHeader';
import CheckoutFooterButton from '../../components/CheckoutFooterButton';

function splitName(fullName) {
  const parts = (fullName ?? '').trim().split(/\s+/);
  if (parts.length <= 1) return { firstName: parts[0] ?? '', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function DocumentUploadTile({ label, value, onPick }) {
  return (
    <TouchableOpacity style={styles.uploadTile} onPress={onPick}>
      {value ? (
        <Image source={{ uri: value }} style={styles.uploadPreview} />
      ) : (
        <View style={styles.uploadPlaceholder}>
          <Ionicons name="camera-outline" size={24} color="#999" />
        </View>
      )}
      <View style={styles.uploadInfo}>
        <Text style={styles.uploadLabel}>{label}</Text>
        <Text style={styles.uploadHint}>{value ? 'Tap to change' : 'Tap to upload'}</Text>
      </View>
      {value && <Ionicons name="checkmark-circle" size={20} color={COLORS.teal} />}
    </TouchableOpacity>
  );
}

export default function CheckoutFormScreen() {
  const { carId } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { draft, updateForm, updateDraft } = useCheckout();

  const initialName = splitName(user?.name);

  const [firstName, setFirstName] = useState(draft.form.firstName || initialName.firstName);
  const [lastName, setLastName] = useState(draft.form.lastName || initialName.lastName);
  const [email, setEmail] = useState(draft.form.email || user?.email || '');
  const [phone, setPhone] = useState(draft.form.phone || user?.phone || '');
  const [address, setAddress] = useState(draft.form.address || '');

  const [licenseFront, setLicenseFront] = useState(draft.licenseFront);
  const [licenseBack, setLicenseBack] = useState(draft.licenseBack);
  const [proofOfAddress, setProofOfAddress] = useState(draft.proofOfAddress);

  const pickImage = async (setter) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow photo library access to upload documents.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) {
      setter(result.assets[0].uri);
    }
  };

  const isValid =
    firstName.trim() && lastName.trim() && email.trim() && phone.trim() && address.trim() &&
    licenseFront && licenseBack && proofOfAddress;

  const handleContinue = () => {
    updateForm({ firstName, lastName, email, phone, address });
    updateDraft({ licenseFront, licenseBack, proofOfAddress });
    router.push({ pathname: '/checkout/payment', params: { carId } });
  };

  return (
    <View style={styles.container}>
      <CheckoutHeader title="Booking Details" step={5} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Your Information</Text>

        <View style={styles.row}>
          <View style={[styles.field, styles.halfField]}>
            <Text style={styles.label}>First Name</Text>
            <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor="#999" />
          </View>
          <View style={[styles.field, styles.halfField]}>
            <Text style={styles.label}>Last Name</Text>
            <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor="#999" />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor="#999" keyboardType="email-address" autoCapitalize="none" />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Phone</Text>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone number" placeholderTextColor="#999" keyboardType="phone-pad" />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Address</Text>
          <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Street address, city" placeholderTextColor="#999" />
        </View>

        <Text style={styles.sectionTitle}>Driver's License</Text>
        <DocumentUploadTile label="License - Front" value={licenseFront} onPick={() => pickImage(setLicenseFront)} />
        <DocumentUploadTile label="License - Back" value={licenseBack} onPick={() => pickImage(setLicenseBack)} />

        <Text style={styles.sectionTitle}>Proof of Address</Text>
        <DocumentUploadTile label="Utility Bill / Bank Statement" value={proofOfAddress} onPick={() => pickImage(setProofOfAddress)} />
      </ScrollView>

      <CheckoutFooterButton label="Continue" onPress={handleContinue} disabled={!isValid} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.navy,
    marginTop: 8,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: COLORS.navy,
    marginBottom: 8,
  },
  input: {
    fontFamily: FONTS.regular,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  uploadTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  uploadPreview: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  uploadPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadInfo: {
    flex: 1,
  },
  uploadLabel: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    color: COLORS.navy,
  },
  uploadHint: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
});
