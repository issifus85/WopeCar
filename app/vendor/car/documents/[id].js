import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../../constants/theme';
import { useAppTheme } from '../../../../contexts/ThemeContext';
import { useVendor } from '../../../../contexts/VendorContext';
import { getCarDocuments, uploadCarDocument } from '../../../../services/documentsApi';
import { MONTH_NAMES } from '../../../../services/vendorCalendar';
import VendorHeader from '../../../../components/VendorHeader';
import SingleDateModal from '../../../../components/SingleDateModal';

function formatExpiry(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
}

function expiryStatus(iso) {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${iso}T00:00:00`);
  if (expiry < today) return 'expired';
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + 30);
  return expiry <= windowEnd ? 'expiring_soon' : null;
}

function DocUploadTile({ label, uri, isPicking, onPick, styles, colors }) {
  return (
    <TouchableOpacity style={styles.docTile} onPress={onPick} disabled={isPicking}>
      {uri ? (
        <Image source={{ uri }} style={styles.docThumbnail} contentFit="cover" />
      ) : (
        <Ionicons name="document-attach-outline" size={26} color={colors.textSubtle} />
      )}
      <Text style={styles.docTileLabel}>{isPicking ? 'Uploading…' : uri ? `Replace ${label}` : `Upload ${label}`}</Text>
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

/**
 * Self-service renewal for the two per-car compliance documents (roadworthy
 * cert + insurance) and the insurance policy number - previously these
 * could only ever be set once, from the Add Car wizard's review step
 * (uploadCarDocument was only ever called from there). Admin already got an
 * upload/edit path of their own this session (wopecar-admin's
 * CarDetailSlideOver); this is the vendor's own counterpart so admin only
 * needs to step in on a vendor's behalf when asked, not as the only way to
 * renew a document at all.
 *
 * Each upload is a fresh insert into `documents` (same as the wizard),
 * never an update to the previous row - getCarDocuments' "latest wins"
 * read already handles that, and expiry_notice_stage (the automated
 * reminder job's own dedupe column - see supabase/migrations/0061_add_
 * document_expiry_reminders.sql) naturally starts null on a new row, so a
 * renewal correctly re-enters the reminder cycle with no extra code needed
 * here, unlike admin's separate expiry-only edit path which has to reset
 * it explicitly.
 */
export default function VendorCarDocumentsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { cars, isLoading: isVendorLoading, updateCar } = useVendor();
  const car = cars.find((c) => c.id === id);

  const [docs, setDocs] = useState({ roadworthy: null, insurance: null });
  const [isDocsLoading, setIsDocsLoading] = useState(true);
  const [policyDraft, setPolicyDraft] = useState('');
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [pickingType, setPickingType] = useState(null); // 'roadworthy' | 'insurance' | null
  const [expiryDrafts, setExpiryDrafts] = useState({ roadworthy: null, insurance: null });
  const [expiryModal, setExpiryModal] = useState(null); // 'roadworthy' | 'insurance' | null

  useEffect(() => {
    if (car) setPolicyDraft(car.insurancePolicyNumber || '');
  }, [car?.insurancePolicyNumber]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setIsDocsLoading(true);
    getCarDocuments(id)
      .then((result) => {
        if (cancelled) return;
        setDocs(result);
        setExpiryDrafts({ roadworthy: result.roadworthy?.expiresAt ?? null, insurance: result.insurance?.expiresAt ?? null });
      })
      .catch(() => !cancelled && setDocs({ roadworthy: null, insurance: null }))
      .finally(() => !cancelled && setIsDocsLoading(false));
    return () => { cancelled = true; };
  }, [id]);

  if (isVendorLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  if (!car) {
    return (
      <View style={styles.container}>
        <VendorHeader title="Compliance Documents" onBack={() => router.back()} />
        <View style={styles.centerState}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.disabled} />
          <Text style={styles.emptyText}>This car couldn't be found.</Text>
        </View>
      </View>
    );
  }

  const policyChanged = policyDraft.trim() !== (car.insurancePolicyNumber || '');

  const handleSavePolicy = async () => {
    setIsSavingPolicy(true);
    try {
      await updateCar(car.id, { insurancePolicyNumber: policyDraft.trim() });
    } catch (e) {
      Alert.alert('Could not save', e?.message || 'Please check your connection and try again.');
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const pickAndUpload = async (type) => {
    if (pickingType) return;
    const label = type === 'roadworthy' ? 'Roadworthy Certificate' : 'Insurance Document';
    if (!expiryDrafts[type]) {
      Alert.alert('Set an expiry date first', `Tap the expiry field below to set ${label}'s expiry date before uploading.`);
      return;
    }
    setPickingType(type);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow photo library access to upload documents.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (result.canceled || !result.assets?.[0]) return;
      await uploadCarDocument(car.id, type, result.assets[0].uri, expiryDrafts[type]);
      const refreshed = await getCarDocuments(car.id);
      setDocs(refreshed);
    } catch (e) {
      Alert.alert('Upload failed', e?.message || 'Please try again.');
    } finally {
      setPickingType(null);
    }
  };

  const renderDocSection = (type, sectionLabel, tileLabel) => {
    const doc = docs[type];
    const status = doc ? expiryStatus(doc.expiresAt) : null;
    return (
      <View key={type}>
        <Text style={[styles.label, styles.labelSpaced]}>{sectionLabel}</Text>
        <DocUploadTile
          label={tileLabel}
          uri={doc?.signedUrl}
          isPicking={pickingType === type}
          onPick={() => pickAndUpload(type)}
          styles={styles}
          colors={colors}
        />
        <ExpiryField
          label={tileLabel}
          value={expiryDrafts[type]}
          onPress={() => setExpiryModal(type)}
          styles={styles}
          colors={colors}
        />
        {doc?.expiresAt && (
          <Text style={[styles.statusText, status === 'expired' && styles.statusExpired, status === 'expiring_soon' && styles.statusExpiringSoon]}>
            {status === 'expired' ? 'Expired' : status === 'expiring_soon' ? 'Expiring soon' : 'Expires'} {formatExpiry(doc.expiresAt)}
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <VendorHeader title="Compliance Documents" subtitle={car.name} onBack={() => router.back()} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.infoBox}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.teal} />
            <Text style={styles.infoText}>
              Renew your roadworthy certificate or insurance here any time - no need to contact WopeCar support unless you'd rather have us handle it for you.
            </Text>
          </View>

          <Text style={styles.label}>Insurance Policy Number</Text>
          <View style={styles.field}>
            <View style={styles.policyRow}>
              <TextInput
                style={[styles.input, styles.policyInput]}
                value={policyDraft}
                onChangeText={setPolicyDraft}
                placeholder="e.g. POL-2026-004821"
                placeholderTextColor={colors.textSubtle}
                autoCapitalize="characters"
              />
              {policyChanged && (
                <TouchableOpacity style={styles.saveButton} onPress={handleSavePolicy} disabled={isSavingPolicy}>
                  <Text style={styles.saveButtonText}>{isSavingPolicy ? 'Saving…' : 'Save'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {isDocsLoading ? (
            <ActivityIndicator size="small" color={colors.teal} style={{ marginTop: 20 }} />
          ) : (
            <>
              {renderDocSection('roadworthy', 'Roadworthy Certificate', 'Roadworthy Cert.')}
              {renderDocSection('insurance', 'Insurance Document', 'Insurance Doc')}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <SingleDateModal
        visible={expiryModal === 'roadworthy'}
        onClose={() => setExpiryModal(null)}
        title="Roadworthy Expiry Date"
        value={expiryDrafts.roadworthy}
        onApply={(iso) => setExpiryDrafts((prev) => ({ ...prev, roadworthy: iso }))}
      />
      <SingleDateModal
        visible={expiryModal === 'insurance'}
        onClose={() => setExpiryModal(null)}
        title="Insurance Expiry Date"
        value={expiryDrafts.insurance}
        onApply={(iso) => setExpiryDrafts((prev) => ({ ...prev, insurance: iso }))}
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
      gap: 8,
      padding: 20,
    },
    emptyText: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textSubtle,
      textAlign: 'center',
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
      marginTop: 24,
    },
    field: {
      marginBottom: 4,
    },
    policyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
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
    policyInput: {
      flex: 1,
    },
    saveButton: {
      backgroundColor: colors.teal,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    saveButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.white,
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
    statusText: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 6,
    },
    statusExpired: {
      fontFamily: FONTS.semiBold,
      color: colors.error,
    },
    statusExpiringSoon: {
      fontFamily: FONTS.semiBold,
      color: colors.warning,
    },
  });
}
