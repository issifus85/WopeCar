import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { getRentalAgreement } from '../../services/rentalAgreementApi';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function RentalAgreementReportScreen() {
  const { bookingId } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [agreement, setAgreement] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    getRentalAgreement(bookingId)
      .then((result) => { if (!cancelled) setAgreement(result ?? null); })
      .catch(() => { if (!cancelled) setAgreement(null); });
    return () => { cancelled = true; };
  }, [bookingId]);

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
          <Row label="Daily Rate" value={agreement.dailyRate !== '' ? `¢${agreement.dailyRate}` : '—'} styles={styles} />
          <Row label="Security Deposit" value={agreement.securityDeposit !== '' ? `¢${agreement.securityDeposit}` : '—'} styles={styles} />
          <Row label="Ghana-Only Use" value={agreement.ghanaOnlyUse ? 'Agreed' : 'Not agreed'} styles={styles} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Signatures</Text>
          <View style={styles.signatureRow}>
            <SignatureThumb label="Client" hasSignature={agreement.hasClientSignature} styles={styles} colors={colors} />
            <SignatureThumb label="WopeCar Representative" hasSignature={agreement.hasRepresentativeSignature} styles={styles} colors={colors} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Status</Text>
          <Row label="Submitted" value={formatDate(agreement.submittedAt)} styles={styles} />
        </View>
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

function SignatureThumb({ label, hasSignature, styles, colors }) {
  return (
    <View style={styles.signatureThumbWrap}>
      <View style={styles.signatureThumb}>
        {hasSignature ? (
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
    signatureThumbLabel: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
      marginTop: 4,
    },
  });
}
