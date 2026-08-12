import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useAddCar } from '../../../contexts/AddCarContext';
import { MONTH_NAMES } from '../../../services/vendorCalendar';
import VendorWizardHeader from '../../../components/VendorWizardHeader';
import CheckoutFooterButton from '../../../components/CheckoutFooterButton';
import SingleDateModal from '../../../components/SingleDateModal';

function formatExpiry(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
}

function DocUploadTile({ label, uri, isPicking, onPick, styles, colors }) {
  return (
    <TouchableOpacity style={styles.docTile} onPress={onPick} disabled={isPicking}>
      {uri ? (
        <Image source={{ uri }} style={styles.docThumbnail} contentFit="cover" />
      ) : (
        <Ionicons name="document-attach-outline" size={26} color={colors.textSubtle} />
      )}
      <Text style={styles.docTileLabel}>{isPicking ? 'Opening…' : uri ? `${label} ✓` : `Upload ${label}`}</Text>
    </TouchableOpacity>
  );
}

function ExpiryField({ label, value, onPress, styles, colors }) {
  return (
    <TouchableOpacity style={styles.expiryField} onPress={onPress}>
      <Ionicons name="calendar-outline" size={16} color={colors.textSubtle} />
      <Text style={[styles.expiryText, !value && styles.expiryPlaceholder]}>
        {value ? `${label} expires ${formatExpiry(value)}` : `Set ${label} expiry date`}
      </Text>
    </TouchableOpacity>
  );
}

// Compliance documents step - split out from the vetting-appointment step so
// the wizard's sequence is: vehicle details -> location/pricing -> regional
// add-ons -> compliance documents (required) -> schedule vetting photos
// (last). Previously these lived together on one screen; separating them
// keeps "provide required documents" and "book an appointment" as distinct
// steps, with scheduling deliberately last per the product decision.
export default function AddCarDocumentsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { draft, updateDraft } = useAddCar();
  const [expiryModal, setExpiryModal] = useState(null); // 'roadworthy' | 'insurance' | null
  const [pickingField, setPickingField] = useState(null); // guards against a double-tap launching two overlapping native pickers, which can leave the picker sheet stuck open and unresponsive

  const isValid = !!draft.insurancePolicyNumber.trim()
    && !!draft.roadworthyDocUri && !!draft.roadworthyExpiryDate
    && !!draft.insuranceDocUri && !!draft.insuranceExpiryDate;

  const pickDocument = async (field) => {
    if (pickingField) return;
    setPickingField(field);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow photo library access to upload documents.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) return;
      updateDraft({ [field]: result.assets[0].uri });
    } catch (e) {
      Alert.alert('Could not open photo library', 'Please try again.');
    } finally {
      setPickingField(null);
    }
  };

  const handleContinue = () => {
    router.push('/vendor/add-car/vetting');
  };

  return (
    <View style={styles.container}>
      <VendorWizardHeader title="Compliance Documents" step={4} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.infoBox}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.teal} />
            <Text style={styles.infoText}>
              Every car on WopeCar needs a valid roadworthy certificate and insurance on file, with their expiry
              dates, so admin can confirm they're current before your listing goes live.
            </Text>
          </View>

          <Text style={styles.label}>Insurance Policy Number</Text>
          <View style={styles.field}>
            <TextInput
              style={styles.input}
              value={draft.insurancePolicyNumber}
              onChangeText={(v) => updateDraft({ insurancePolicyNumber: v })}
              placeholder="e.g. POL-2026-004821"
              placeholderTextColor={colors.textSubtle}
              autoCapitalize="characters"
            />
          </View>

          <Text style={[styles.label, styles.labelSpaced]}>Roadworthy Certificate</Text>
          <DocUploadTile
            label="Roadworthy Cert."
            uri={draft.roadworthyDocUri}
            isPicking={pickingField === 'roadworthyDocUri'}
            onPick={() => pickDocument('roadworthyDocUri')}
            styles={styles}
            colors={colors}
          />
          <ExpiryField
            label="Roadworthy certificate"
            value={draft.roadworthyExpiryDate}
            onPress={() => setExpiryModal('roadworthy')}
            styles={styles}
            colors={colors}
          />

          <Text style={[styles.label, styles.labelSpaced]}>Insurance Document</Text>
          <DocUploadTile
            label="Insurance Doc"
            uri={draft.insuranceDocUri}
            isPicking={pickingField === 'insuranceDocUri'}
            onPick={() => pickDocument('insuranceDocUri')}
            styles={styles}
            colors={colors}
          />
          <ExpiryField
            label="Insurance"
            value={draft.insuranceExpiryDate}
            onPress={() => setExpiryModal('insurance')}
            styles={styles}
            colors={colors}
          />

          <Text style={styles.docHint}>
            A policy number, both documents, and both expiry dates are required before this car can be listed.
          </Text>
        </ScrollView>

        <CheckoutFooterButton label="Continue" onPress={handleContinue} disabled={!isValid} />
      </KeyboardAvoidingView>

      <SingleDateModal
        visible={expiryModal === 'roadworthy'}
        onClose={() => setExpiryModal(null)}
        title="Roadworthy Expiry Date"
        value={draft.roadworthyExpiryDate}
        onApply={(iso) => updateDraft({ roadworthyExpiryDate: iso })}
      />
      <SingleDateModal
        visible={expiryModal === 'insurance'}
        onClose={() => setExpiryModal(null)}
        title="Insurance Expiry Date"
        value={draft.insuranceExpiryDate}
        onApply={(iso) => updateDraft({ insuranceExpiryDate: iso })}
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
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    infoBox: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: colors.highlight,
      borderRadius: 12,
      padding: 14,
      marginBottom: 20,
    },
    infoText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 18,
    },
    label: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
      marginBottom: 10,
    },
    labelSpaced: {
      marginTop: 20,
    },
    field: {
      marginBottom: 4,
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textPrimary,
    },
    docTile: {
      aspectRatio: 2.2,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      overflow: 'hidden',
      padding: 8,
      marginBottom: 10,
    },
    docThumbnail: {
      ...StyleSheet.absoluteFillObject,
    },
    docTileLabel: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.textSubtle,
      textAlign: 'center',
      backgroundColor: colors.surface,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      overflow: 'hidden',
    },
    expiryField: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    expiryText: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textPrimary,
    },
    expiryPlaceholder: {
      color: colors.textSubtle,
      fontFamily: FONTS.regular,
    },
    docHint: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
      marginTop: 16,
      lineHeight: 16,
    },
  });
}
