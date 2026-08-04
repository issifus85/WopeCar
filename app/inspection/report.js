import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { getInspection } from '../../services/inspectionsApi';
import supabase from '../../services/supabase';

// Mirrors interior.js's own SECTIONS exactly, so the report reads back the
// same human labels the wizard's checklist screen showed, not raw
// camelCase keys from the stored jsonb blob.
const SECTIONS = [
  {
    title: 'Exterior & Lights',
    items: [
      { key: 'lightsOperational', label: 'All lights operational (headlights, brake, tail, indicators, hazard, reverse)' },
      { key: 'mirrorsGoodCondition', label: 'Mirrors (side & rearview) in good condition' },
      { key: 'windshieldClear', label: 'Windshield clear (no cracks or chips)' },
      { key: 'wipersFunctioning', label: 'Wipers & washer functioning' },
      { key: 'bodyConditionGood', label: 'Body condition (no major dents, rust, or scratches)' },
      { key: 'doorsLocksFunctioning', label: 'Doors & locks functioning properly' },
    ],
  },
  {
    title: 'Tyres & Safety',
    items: [
      { key: 'tyresGoodCondition', label: 'Tyres in good condition (no cracks, bulges, or uneven wear)' },
      { key: 'wheelAlignmentBalance', label: 'Wheel alignment & balance' },
      { key: 'seatBeltsFunctioning', label: 'Seat belts functioning' },
    ],
  },
  {
    title: 'Fluids & Engine',
    items: [
      { key: 'engineOilGood', label: 'Engine oil level & condition' },
      { key: 'brakeFluidGood', label: 'Brake fluid level' },
      { key: 'coolantLevelGood', label: 'Coolant level (no leaks)' },
    ],
  },
  {
    title: 'Interior & Function',
    items: [
      { key: 'noDashboardWarningLights', label: 'No dashboard warning lights (engine, ABS, airbag)' },
      { key: 'acFunctioning', label: 'Air conditioning functioning' },
    ],
  },
  {
    title: 'Safety Equipment',
    items: [
      { key: 'warningTriangles', label: '2 warning triangles' },
      { key: 'spareTire', label: 'Spare tyre' },
      { key: 'jack', label: 'Jack' },
      { key: 'spannerTools', label: 'Spanner / tools' },
      { key: 'fireExtinguisher', label: 'Fire extinguisher' },
    ],
  },
];

const PHOTO_ANGLES = [
  { key: 'front', label: 'Front' },
  { key: 'back', label: 'Back' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
  { key: 'odometer', label: 'Odometer' },
];

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function InspectionReportScreen() {
  const { bookingId, type } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [inspection, setInspection] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    getInspection(bookingId, type)
      .then((result) => { if (!cancelled) setInspection(result ?? null); })
      .catch(() => { if (!cancelled) setInspection(null); });
    return () => { cancelled = true; };
  }, [bookingId, type]);

  if (inspection === undefined) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  if (!inspection) {
    return (
      <View style={styles.container}>
        <Header router={router} type={type} styles={styles} colors={colors} />
        <View style={styles.centerState}>
          <Text style={styles.emptyText}>Report not found.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header router={router} type={type} styles={styles} colors={colors} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Trip Info</Text>
          <Row label="Mileage" value={inspection.mileage != null ? `${inspection.mileage} km` : '—'} styles={styles} />
          <Row label="Fuel Level" value={inspection.fuelLevel || '—'} styles={styles} />
          <Row label="Submitted" value={formatDate(inspection.submittedAt)} styles={styles} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Vehicle Checklist</Text>
          {SECTIONS.map((section) => (
            <View key={section.title} style={styles.checklistSection}>
              <Text style={styles.checklistSectionTitle}>{section.title}</Text>
              {section.items.map((item) => (
                <View key={item.key} style={styles.checkRow}>
                  <Ionicons
                    name={inspection.checklist?.[item.key] ? 'checkmark-circle' : 'close-circle-outline'}
                    size={16}
                    color={inspection.checklist?.[item.key] ? colors.success : colors.textSubtle}
                  />
                  <Text style={styles.checkLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          ))}
          {!!inspection.checklist?.notes && (
            <View style={styles.checklistSection}>
              <Text style={styles.checklistSectionTitle}>Notes</Text>
              <Text style={styles.notesText}>{inspection.checklist.notes}</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Photos</Text>
          <View style={styles.photoGrid}>
            {PHOTO_ANGLES.map(({ key, label }) => (
              <PhotoThumb key={key} label={label} path={inspection.photos.find((p) => p.angle === key)} styles={styles} colors={colors} />
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Damage Points</Text>
          {inspection.damagePoints.length === 0 ? (
            <Text style={styles.notesText}>No damage reported.</Text>
          ) : (
            inspection.damagePoints.map((d, i) => (
              <View key={i} style={styles.checkRow}>
                <Ionicons name="warning-outline" size={16} color={colors.warning} />
                <Text style={styles.checkLabel}>
                  {d.view} — {d.damageType}{d.note ? `: ${d.note}` : ''}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Signatures</Text>
          <View style={styles.signatureRow}>
            <SignatureThumb label="Renter" hasSignature={inspection.hasRenterSignature} styles={styles} colors={colors} />
            <SignatureThumb label="Host / Agent" hasSignature={inspection.hasAgentSignature} styles={styles} colors={colors} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Header({ router, type, styles, colors }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </TouchableOpacity>
      <View style={styles.headerTitleWrap}>
        <Text style={styles.headerTitle}>Inspection Report</Text>
        <Text style={styles.headerSubtitle}>{type === 'post' ? 'Post-Rental' : 'Pre-Rental'}</Text>
      </View>
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

function PhotoThumb({ label, path, styles, colors }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!path) return;
    supabase.storage.from('documents').createSignedUrl(path.filePath, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }, [path]);

  return (
    <View style={styles.photoThumbWrap}>
      {url ? (
        <Image source={{ uri: url }} style={styles.photoThumb} />
      ) : (
        <View style={[styles.photoThumb, styles.photoThumbPlaceholder]}>
          <Ionicons name="image-outline" size={20} color={colors.disabled} />
        </View>
      )}
      <Text style={styles.photoThumbLabel}>{label}</Text>
    </View>
  );
}

function SignatureThumb({ label, hasSignature, styles, colors }) {
  return (
    <View style={styles.signatureThumbWrap}>
      <View style={[styles.signatureThumb, !hasSignature && styles.photoThumbPlaceholder]}>
        {hasSignature ? (
          <Ionicons name="checkmark-circle" size={22} color={colors.success} />
        ) : (
          <Ionicons name="close-circle-outline" size={22} color={colors.disabled} />
        )}
      </View>
      <Text style={styles.photoThumbLabel}>{label}</Text>
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
    headerTitleWrap: {},
    headerTitle: {
      fontFamily: FONTS.bold,
      fontSize: 18,
      color: colors.textPrimary,
    },
    headerSubtitle: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 2,
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
    checklistSection: {
      marginBottom: 12,
    },
    checklistSectionTitle: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
      marginBottom: 6,
    },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginBottom: 6,
    },
    checkLabel: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textPrimary,
    },
    notesText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textMuted,
    },
    photoGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    photoThumbWrap: {
      alignItems: 'center',
      width: 84,
    },
    photoThumb: {
      width: 72,
      height: 72,
      borderRadius: 10,
    },
    photoThumbPlaceholder: {
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoThumbLabel: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
      marginTop: 4,
    },
    signatureRow: {
      flexDirection: 'row',
      gap: 20,
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
  });
}
