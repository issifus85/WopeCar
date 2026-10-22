import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Image, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { getRentalAgreement, getRentalAgreementSignatureUrl } from '../../services/rentalAgreementApi';
import { parseDateOnly } from '../../constants/dateUtils';

function formatDate(value) {
  if (!value) return '—';
  return parseDateOnly(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function RentalAgreementReportScreen() {
  const { bookingId } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [agreement, setAgreement] = useState(undefined);
  const [isOpeningPdf, setIsOpeningPdf] = useState(false);
  // Signature images (signed URLs) - null while loading or when this viewer
  // isn't allowed to read them, in which case the thumbnail shows a tick.
  const [signatureUrls, setSignatureUrls] = useState({ client: null, representative: null });

  useEffect(() => {
    let cancelled = false;
    getRentalAgreement(bookingId)
      .then((result) => { if (!cancelled) setAgreement(result ?? null); })
      .catch(() => { if (!cancelled) setAgreement(null); });
    return () => { cancelled = true; };
  }, [bookingId]);

  useEffect(() => {
    if (!agreement) return;
    let cancelled = false;
    Promise.all([
      getRentalAgreementSignatureUrl(agreement.clientSignaturePath),
      getRentalAgreementSignatureUrl(agreement.representativeSignaturePath),
    ])
      .then(([client, representative]) => { if (!cancelled) setSignatureUrls({ client, representative }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [agreement]);

  const handleOpenPdf = async () => {
    setIsOpeningPdf(true);
    try {
      const url = await getRentalAgreementSignatureUrl(agreement.reportPdfPath);
      if (url) Linking.openURL(url);
    } finally {
      setIsOpeningPdf(false);
    }
  };

  if (agreement === undefined) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  if (!agreement) {
    return (
      <View style={styles.container}>
        <Header router={router} styles={styles} colors={colors} />
        <View style={styles.centerState}>
          <Text style={styles.emptyText}>Agreement not found.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header router={router} styles={styles} colors={colors} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Parties</Text>
          <Row label="Lessee" value={agreement.lesseeName} styles={styles} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Vehicle</Text>
          <Row label="Registration" value={agreement.vehicleRegistration} styles={styles} />
          <Row label="Make" value={agreement.vehicleMake} styles={styles} />
          <Row label="Color" value={agreement.vehicleColor || '—'} styles={styles} />
          <Row label="Year" value={agreement.vehicleYear || '—'} styles={styles} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Rental Terms</Text>
          <Row label="Duration" value={`${formatDate(agreement.durationStart)} — ${formatDate(agreement.durationEnd)}`} styles={styles} />
          <Row label="Pickup Time" value={agreement.pickupTime || '—'} styles={styles} />
          <Row label="Return Time" value={agreement.returnTime || '—'} styles={styles} />
          <Row label="Daily Rate" value={agreement.dailyRate !== '' ? `GH₵${agreement.dailyRate}` : '—'} styles={styles} />
          <Row label="Security Deposit" value={agreement.securityDeposit !== '' ? `GH₵${agreement.securityDeposit}` : '—'} styles={styles} />
          <Row label="Ghana-Only Use" value={agreement.ghanaOnlyUse ? 'Agreed' : 'Not agreed'} styles={styles} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Signatures</Text>
          <View style={styles.signatureRow}>
            <SignatureThumb label="Client" hasSignature={agreement.hasClientSignature} url={signatureUrls.client} styles={styles} colors={colors} />
            <SignatureThumb label="WopeCar Representative" hasSignature={agreement.hasRepresentativeSignature} url={signatureUrls.representative} styles={styles} colors={colors} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Status</Text>
          <Row label="Submitted" value={formatDate(agreement.submittedAt)} styles={styles} />
        </View>

        {/* The PDF copy generated when the agreement was completed (also emailed to the renter and WopeCar). */}
        {!!agreement.reportPdfPath && (
          <TouchableOpacity style={styles.pdfButton} onPress={handleOpenPdf} disabled={isOpeningPdf}>
            <Ionicons name="document-text-outline" size={18} color={colors.teal} />
            <Text style={styles.pdfButtonText}>{isOpeningPdf ? 'Opening...' : 'Open PDF copy'}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function Header({ router, styles, colors }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Rental Agreement</Text>
    </View>
  );
}

function Row({ label, value, styles }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function SignatureThumb({ label, hasSignature, url, styles, colors }) {
  return (
    <View style={styles.signatureThumbWrap}>
      <View style={url ? styles.signatureImageBox : styles.signatureThumb}>
        {url ? (
          <Image source={{ uri: url }} style={styles.signatureImage} resizeMode="contain" />
        ) : hasSignature ? (
          <Ionicons name="checkmark-circle" size={22} color={colors.success} />
        ) : (
          <Ionicons name="close-circle-outline" size={22} color={colors.disabled} />
        )}
      </View>
      <Text style={styles.signatureThumbLabel}>{label}</Text>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    pdfButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.teal,
      marginTop: 4,
      marginBottom: 12,
    },
    pdfButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.teal,
    },
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textMuted,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingTop: 56,
      paddingHorizontal: 20,
      paddingBottom: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    headerTitle: {
      fontFamily: FONTS.bold,
      fontSize: 18,
      color: colors.textPrimary,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    card: {
      backgroundColor: colors.background,
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardTitle: {
      fontFamily: FONTS.bold,
      fontSize: 15,
      color: colors.textPrimary,
      marginBottom: 12,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    infoLabel: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
    },
    infoValue: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
    },
    signatureRow: {
      flexDirection: 'row',
      gap: 24,
    },
    signatureThumbWrap: {
      alignItems: 'center',
    },
    signatureThumb: {
      width: 60,
      height: 60,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    signatureImageBox: {
      width: 140,
      height: 80,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    signatureImage: {
      width: '100%',
      height: '100%',
    },
    signatureThumbLabel: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
      marginTop: 4,
    },
  });
}
