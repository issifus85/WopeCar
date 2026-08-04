import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useInspection } from '../../contexts/InspectionContext';
import { syncInspection } from '../../services/inspectionsApi';
import InspectionHeader from '../../components/InspectionHeader';
import CheckoutFooterButton from '../../components/CheckoutFooterButton';

const FUEL_LEVELS = ['Empty', '1/4', 'Half', '3/4', 'Full'];

export default function InspectionMileageScreen() {
  const { bookingId, localId, type } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { draft, startInspection, updateDraft } = useInspection();

  useEffect(() => {
    startInspection(bookingId, type);
  }, [bookingId, type]);

  const [mileage, setMileage] = useState(draft.bookingId === String(bookingId) ? String(draft.mileage || '') : '');
  const [fuelLevel, setFuelLevel] = useState(draft.bookingId === String(bookingId) ? draft.fuelLevel : '');

  // Draft only finishes resolving (resumed from storage, or freshly reset by
  // startInspection above) after this render - reseed local state once it
  // settles, matching checkout/form.js's pattern of seeding from draft.*.
  useEffect(() => {
    if (draft.bookingId === String(bookingId) && draft.type === type) {
      setMileage(String(draft.mileage || ''));
      setFuelLevel(draft.fuelLevel || '');
    }
  }, [draft.bookingId, draft.type]);

  const isValid = mileage.trim().length > 0 && !isNaN(Number(mileage)) && !!fuelLevel;

  const handleContinue = async () => {
    updateDraft({ mileage: Number(mileage), fuelLevel });

    // Best-effort - the local draft (via InspectionContext + inspectionStorage)
    // is already the source of truth, so a sync failure here must never
    // block the wizard. Retried automatically on the next step's Continue.
    try {
      const inspection = await syncInspection(bookingId, {
        type,
        mileage: Number(mileage),
        fuelLevel,
        checklist: draft.checklist,
        damagePoints: draft.damagePoints,
      });
      updateDraft({ serverId: inspection.id, pendingSync: false });
    } catch (e) {
      updateDraft({ pendingSync: true });
    }

    router.push({ pathname: '/inspection/exterior', params: { bookingId, localId, type } });
  };

  return (
    <View style={styles.container}>
      <InspectionHeader title={type === 'post' ? 'Post-Rental Inspection' : 'Pre-Rental Inspection'} step={1} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Mileage</Text>
        <View style={styles.field}>
          <Text style={styles.label}>Odometer Reading (km)</Text>
          <TextInput
            style={styles.input}
            value={mileage}
            onChangeText={setMileage}
            placeholder="e.g. 45210"
            placeholderTextColor={colors.textSubtle}
            keyboardType="numeric"
          />
        </View>

        <Text style={styles.sectionTitle}>Fuel / Battery Level</Text>
        <View style={styles.slotGrid}>
          {FUEL_LEVELS.map((level) => (
            <TouchableOpacity
              key={level}
              style={[styles.slot, fuelLevel === level && styles.slotActive]}
              onPress={() => setFuelLevel(level)}
            >
              <Text style={[styles.slotText, fuelLevel === level && styles.slotTextActive]}>{level}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <CheckoutFooterButton label="Continue" onPress={handleContinue} disabled={!isValid} />
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    flex: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    sectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 16,
      color: colors.textPrimary,
      marginTop: 8,
      marginBottom: 14,
    },
    field: {
      marginBottom: 16,
    },
    label: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
      marginBottom: 8,
    },
    input: {
      fontFamily: FONTS.regular,
      backgroundColor: colors.background,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.textPrimary,
    },
    slotGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    slot: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    slotActive: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    slotText: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textMuted,
    },
    slotTextActive: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
    },
  });
}
