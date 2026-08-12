import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter, useNavigation } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import * as documentsApi from '../services/documentsApi';

const VERIFICATION_TYPES = [
  { type: 'license_front', label: "Driver's License - Front" },
  { type: 'license_back', label: "Driver's License - Back" },
  { type: 'proof_of_address', label: 'Proof of Address' },
];

function isExpired(dateString) {
  if (!dateString) return false;
  return new Date(dateString) < new Date();
}

function badgeMeta(status, colors) {
  const map = {
    verified: { label: 'Verified', bg: colors.successBg, text: colors.success },
    pending: { label: 'Pending', bg: colors.warningBg, text: colors.warning },
    rejected: { label: 'Rejected', bg: colors.errorBg, text: colors.error },
    expired: { label: 'Expired', bg: colors.errorBg, text: colors.error },
    uploaded: { label: 'Uploaded', bg: colors.successBg, text: colors.success },
    missing: { label: 'Not Uploaded', bg: colors.divider, text: colors.textSubtle },
  };
  return map[status] ?? map.missing;
}

function Section({ title, children, styles }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Badge({ status, styles, colors }) {
  const meta = badgeMeta(status, colors);
  return (
    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
      <Text style={[styles.badgeText, { color: meta.text }]}>{meta.label}</Text>
    </View>
  );
}

function VerificationRow({ config, document, isUploading, last, onView, onUpload, styles, colors }) {
  // Only license_front/license_back carry the account-level verification
  // status + expiry (users.license_verification_status/driver_license_expiry
  // - there's no per-document verification concept on the backend, and
  // proof_of_address has no expiry at all) - everything else just reflects
  // whether a document row exists.
  const status = !document ? 'missing' : (config.status ?? 'uploaded');

  return (
    <TouchableOpacity
      style={[styles.row, last && styles.rowLast]}
      onPress={() => (document ? onView(document) : onUpload(config.type))}
      disabled={isUploading}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={document ? 'document-text' : 'cloud-upload-outline'} size={18} color={colors.teal} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowLabel}>{config.label}</Text>
        <Text style={styles.rowSubtitle}>{document ? 'Tap to view' : 'Tap to upload'}</Text>
      </View>
      {isUploading ? <ActivityIndicator color={colors.teal} /> : <Badge status={status} styles={styles} colors={colors} />}
    </TouchableOpacity>
  );
}

function EmptySection({ text, styles, colors }) {
  return (
    <View style={styles.emptyRow}>
      <Ionicons name="folder-open-outline" size={20} color={colors.disabled} />
      <Text style={styles.emptyRowText}>{text}</Text>
    </View>
  );
}

export default function DocumentsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [documents, setDocuments] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState(null);

  // Only reached from Profile's menu (pushed from inside the (tabs) group's
  // nested navigator), so the default back button can leave GO_BACK
  // unresolved on web even though Profile is a real previous screen - same
  // fix as protection-plan.js/account.js: a custom headerLeft that always
  // router.replace()s to a known destination instead of relying on GO_BACK.
  const handleBack = useCallback(() => {
    router.replace('/(tabs)/profile');
  }, [router]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={handleBack} hitSlop={10} style={styles.headerBackButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          <Text style={styles.headerBackLabel}>Account</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleBack, styles, colors]);

  const load = useCallback(() => {
    documentsApi.getDocuments()
      .then(setDocuments)
      .catch(() => setDocuments({ verification: [], trip: [], vir: [], vehicle: [] }))
      .finally(() => setIsLoading(false));
  }, []);

  useFocusEffect(load);

  const handleView = (document) => {
    // VIR reports have no external file (see services/inspectionsApi.js) -
    // they open the in-app read-only report screen instead.
    if (document.reportRoute) {
      router.push(document.reportRoute);
      return;
    }
    Linking.openURL(document.signedUrl);
  };

  const handleUpload = async (type) => {
    if (uploadingType) return;
    // Set before the picker even launches, not just around the upload -
    // otherwise a double-tap while the permission check/picker is still
    // opening can launch two overlapping native pickers, which can leave
    // the picker sheet stuck open and unresponsive.
    setUploadingType(type);
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

      await documentsApi.uploadDocument(type, result.assets[0].uri);
      load();
    } catch (e) {
      Alert.alert('Upload failed', e.message || 'Could not upload this document. Please try again.');
    } finally {
      setUploadingType(null);
    }
  };

  if (isLoading || !documents) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  const licenseStatus = isExpired(user?.driverLicenseExpiry) ? 'expired' : (user?.licenseVerificationStatus ?? 'pending');
  const verificationDocs = VERIFICATION_TYPES.map((config) => ({
    config: config.type === 'proof_of_address' ? config : { ...config, status: licenseStatus },
    document: documents.verification.find((d) => d.type === config.type) ?? null,
  }));

  const tripByBooking = groupByBooking(documents.trip);
  const virByBooking = groupByBooking(documents.vir);
  const vehicleByCar = groupByCar(documents.vehicle);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Section title="Verification Docs" styles={styles}>
        {verificationDocs.map(({ config, document }, index) => (
          <VerificationRow
            key={config.type}
            config={config}
            document={document}
            isUploading={uploadingType === config.type}
            last={index === verificationDocs.length - 1}
            onView={handleView}
            onUpload={handleUpload}
            styles={styles}
            colors={colors}
          />
        ))}
      </Section>

      <Section title="Trip Documents" styles={styles}>
        {tripByBooking.length === 0 ? (
          <EmptySection text="No rental agreements or insurance certificates yet." styles={styles} colors={colors} />
        ) : (
          tripByBooking.map(({ bookingId, docs }) => (
            <View key={bookingId ?? 'none'}>
              {docs.map((doc) => (
                <TouchableOpacity key={doc.id} style={styles.row} onPress={() => handleView(doc)}>
                  <View style={styles.rowIcon}>
                    <Ionicons name="document-text" size={18} color={colors.teal} />
                  </View>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowLabel}>{tripDocLabel(doc.type)}</Text>
                    <Text style={styles.rowSubtitle}>Booking #{bookingId}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}
        <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/settings/payment-history')}>
          <Text style={styles.linkRowText}>Invoices &amp; Receipts</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.teal} />
        </TouchableOpacity>
      </Section>

      <Section title="Vehicle Inspection Reports" styles={styles}>
        {virByBooking.length === 0 ? (
          <EmptySection text="Completed pre/post-rental inspection reports will appear here." styles={styles} colors={colors} />
        ) : (
          virByBooking.map(({ bookingId, docs }) => (
            <View key={bookingId ?? 'none'}>
              {docs.map((doc) => (
                <TouchableOpacity key={doc.id} style={styles.row} onPress={() => handleView(doc)}>
                  <View style={styles.rowIcon}>
                    <Ionicons name="clipboard" size={18} color={colors.teal} />
                  </View>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowLabel}>Inspection Report</Text>
                    <Text style={styles.rowSubtitle}>Booking #{bookingId}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}
      </Section>

      {vehicleByCar.length > 0 && (
        <Section title="Vehicle Documents" styles={styles}>
          {vehicleByCar.map(({ carId, carName, docs }) => (
            <View key={carId}>
              <Text style={styles.groupHeading}>{carName || 'Your car'}</Text>
              {docs.map((doc, index) => (
                <TouchableOpacity
                  key={doc.id}
                  style={[styles.row, index === docs.length - 1 && styles.rowLast]}
                  onPress={() => handleView(doc)}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name="shield-checkmark" size={18} color={colors.teal} />
                  </View>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowLabel}>{vehicleDocLabel(doc.type)}</Text>
                    <Text style={styles.rowSubtitle}>Tap to view</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

function tripDocLabel(type) {
  return type === 'rental_agreement' ? 'Rental Agreement' : 'Insurance Certificate';
}

function vehicleDocLabel(type) {
  return type === 'roadworthy' ? 'Roadworthy Certificate' : 'Insurance Policy';
}

function groupByBooking(docs) {
  const byBooking = new Map();
  docs.forEach((doc) => {
    const key = doc.bookingId ?? null;
    if (!byBooking.has(key)) byBooking.set(key, []);
    byBooking.get(key).push(doc);
  });
  return Array.from(byBooking.entries()).map(([bookingId, list]) => ({ bookingId, docs: list }));
}

function groupByCar(docs) {
  const byCar = new Map();
  docs.forEach((doc) => {
    const key = doc.carId ?? null;
    if (!byCar.has(key)) byCar.set(key, { carId: key, carName: doc.carName, docs: [] });
    byCar.get(key).docs.push(doc);
  });
  return Array.from(byCar.values());
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
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 40,
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
      paddingHorizontal: 16,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowInfo: {
      flex: 1,
    },
    rowLabel: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    rowSubtitle: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 2,
    },
    badge: {
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    badgeText: {
      fontFamily: FONTS.semiBold,
      fontSize: 11,
    },
    emptyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 16,
    },
    emptyRowText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    linkRowText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.teal,
    },
    groupHeading: {
      fontFamily: FONTS.semiBold,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 12,
      marginBottom: 2,
    },
  });
}
