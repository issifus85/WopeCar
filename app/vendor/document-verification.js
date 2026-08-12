import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useVendor } from '../../contexts/VendorContext';
import { getMyVendorDocuments, uploadVendorDocument } from '../../services/vendorDocumentsApi';
import VendorHeader from '../../components/VendorHeader';
import VendorStatusBadge from '../../components/VendorStatusBadge';

const STATUS_LABEL = {
  not_submitted: 'Not Submitted',
  under_review: 'Under Review',
  verified: 'Verified',
  rejected: 'Rejected',
};

function UploadTile({ label, value, isUploading, disabled, onPick, styles, colors }) {
  return (
    <TouchableOpacity style={styles.uploadTile} onPress={onPick} disabled={isUploading || disabled}>
      {value ? (
        <Image source={{ uri: value }} style={styles.uploadPreview} />
      ) : (
        <View style={styles.uploadPlaceholder}>
          <Ionicons name="camera-outline" size={22} color={colors.textSubtle} />
        </View>
      )}
      <View style={styles.uploadInfo}>
        <Text style={styles.uploadLabel}>{label}</Text>
        <Text style={styles.uploadHint}>{isUploading ? 'Uploading...' : value ? 'Tap to replace' : 'Tap to upload'}</Text>
      </View>
      {isUploading ? (
        <ActivityIndicator size="small" color={colors.teal} />
      ) : (
        value && <Ionicons name="checkmark-circle" size={20} color={colors.teal} />
      )}
    </TouchableOpacity>
  );
}

// Real document status is only ever set by WopeCar reviewing a submission
// (see app/admin/vendors.js) - uploading marks a doc "Under Review", never
// "Verified", matching the same no-auto-approval rule already established
// for new car listings (see app/vendor/add-car/review.js's submit notice).
export default function VendorDocumentVerificationScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isLoading, vendorProfile, refreshVendorProfile } = useVendor();

  const [docs, setDocs] = useState({});
  const [isInitialized, setIsInitialized] = useState(false);
  const [uploadingType, setUploadingType] = useState(null);
  const [isPicking, setIsPicking] = useState(false); // guards against a double-tap launching two overlapping native pickers, which can leave the picker sheet stuck open and unresponsive
  const [error, setError] = useState(null);

  const loadDocs = useCallback(async () => {
    setDocs(await getMyVendorDocuments());
  }, []);

  useEffect(() => {
    if (isInitialized || isLoading) return;
    loadDocs().finally(() => setIsInitialized(true));
  }, [isLoading, isInitialized, loadDocs]);

  const isBusinessVendor = vendorProfile?.businessInfo?.type === 'business';

  const pickImage = async (onPicked) => {
    if (isPicking) return;
    setIsPicking(true);
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
      if (!result.canceled && result.assets?.[0]) {
        onPicked(result.assets[0].uri);
      }
    } catch (e) {
      Alert.alert('Could not open photo library', 'Please try again.');
    } finally {
      setIsPicking(false);
    }
  };

  // Every upload submits immediately (no separate submit step, matching the
  // rest of this wizard's autosave-as-you-go pattern) - uploads to Supabase
  // Storage, flips the matching vendors row to "under_review", then
  // refreshes both the local preview and the shared vendorProfile so the
  // status badge here and on app/vendor/settings.js update together.
  const handlePick = (type) => pickImage(async (uri) => {
    setUploadingType(type);
    setError(null);
    try {
      await uploadVendorDocument(type, uri);
      await Promise.all([loadDocs(), refreshVendorProfile()]);
    } catch (e) {
      setError(e.message || 'Could not upload this document. Please try again.');
    } finally {
      setUploadingType(null);
    }
  });

  if (isLoading || !isInitialized) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  const idStatus = STATUS_LABEL[vendorProfile?.idDocumentStatus] ?? 'Not Submitted';
  const businessDocStatus = STATUS_LABEL[vendorProfile?.businessRegDocumentStatus] ?? 'Not Submitted';

  return (
    <View style={styles.container}>
      <VendorHeader title="Document Verification" subtitle="Ownership and identity documents" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Identity Verification</Text>
          <VendorStatusBadge status={idStatus} />
        </View>
        <View style={styles.card}>
          <UploadTile
            label="Ghana Card - Front"
            value={docs.vendor_id_front}
            isUploading={uploadingType === 'vendor_id_front'}
            disabled={isPicking}
            onPick={() => handlePick('vendor_id_front')}
            styles={styles}
            colors={colors}
          />
          <UploadTile
            label="Ghana Card - Back"
            value={docs.vendor_id_back}
            isUploading={uploadingType === 'vendor_id_back'}
            disabled={isPicking}
            onPick={() => handlePick('vendor_id_back')}
            styles={styles}
            colors={colors}
          />
        </View>
        {idStatus === 'Rejected' && !!vendorProfile?.idDocumentRejectionReason && (
          <Text style={styles.rejectionReason}>{vendorProfile.idDocumentRejectionReason}</Text>
        )}

        <View style={[styles.sectionHeader, styles.sectionSpaced]}>
          <Text style={styles.sectionTitle}>Business Verification</Text>
          {isBusinessVendor && <VendorStatusBadge status={businessDocStatus} />}
        </View>
        {isBusinessVendor ? (
          <View style={styles.card}>
            <UploadTile
              label="Proof of Business Registration"
              value={docs.vendor_business_reg}
              isUploading={uploadingType === 'vendor_business_reg'}
              disabled={isPicking}
              onPick={() => handlePick('vendor_business_reg')}
              styles={styles}
              colors={colors}
            />
          </View>
        ) : (
          <TouchableOpacity style={styles.infoRow} onPress={() => router.push('/vendor/business-info')}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textSubtle} />
            <Text style={styles.infoRowText}>
              Set your account to "Registered Business" in Business & Tax Information to submit this document.
            </Text>
          </TouchableOpacity>
        )}
        {isBusinessVendor && businessDocStatus === 'Rejected' && !!vendorProfile?.businessRegDocumentRejectionReason && (
          <Text style={styles.rejectionReason}>{vendorProfile.businessRegDocumentRejectionReason}</Text>
        )}

        <View style={styles.disclaimer}>
          <Ionicons name="time-outline" size={14} color={colors.textSubtle} />
          <Text style={styles.disclaimerText}>
            WopeCar reviews submitted documents by hand - there's no automatic approval, so a document stays
            "Under Review" until someone checks it.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
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
    errorText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.error,
      textAlign: 'center',
      marginBottom: 12,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    sectionSpaced: {
      marginTop: 24,
    },
    sectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.textSubtle,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 12,
      gap: 10,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    uploadTile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 10,
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
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    uploadInfo: {
      flex: 1,
    },
    uploadLabel: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
    },
    uploadHint: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
      marginTop: 2,
    },
    rejectionReason: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.error,
      marginTop: 8,
      lineHeight: 17,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
    },
    infoRowText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 18,
    },
    disclaimer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 24,
    },
    disclaimerText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
      lineHeight: 16,
    },
  });
}
