import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useInspection } from '../../../contexts/InspectionContext';
import InspectionHeader from '../../../components/InspectionHeader';
import CheckoutFooterButton from '../../../components/CheckoutFooterButton';

const FUEL_LEVELS = ['Empty', '1/4', 'Half', '3/4', 'Full'];

// Vendor Mode variant of app/inspection/mileage.js - same checklist model
// and UI. This step (and interior.js/exterior.js) only ever touch the
// shared local InspectionContext draft, same as the renter-side wizard -
// the real backend sync happens lazily, starting at photos.js's first
// upload (see that file and signatures.js for the real vehicle_inspections
// writes now backing this wizard).
export default function VendorInspectionMileageScreen() {
  const { bookingId, type } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { draft, startInspection, updateDraft } = useInspection();

  useEffect(() => {
    startInspection(bookingId, type);
  }, [bookingId, type]);

  const [mileage, setMileage] = useState(draft.bookingId === String(bookingId) ? String(draft.mileage || '') : '');
  const [fuelLevel, setFuelLevel] = useState(draft.bookingId === String(bookingId) ? draft.fuelLevel : '');

  useEffect(() => {
    if (draft.bookingId === String(bookingId) && draft.type === type) {
      setMileage(String(draft.mileage || ''));
      setFuelLevel(draft.fuelLevel || '');
    }
  }, [draft.bookingId, draft.type]);

  const isValid = mileage.trim().length > 0 && !isNaN(Number(mileage)) && !!fuelLevel;

  const handleContinue = () => {
    updateDraft({ mileage: Number(mileage), fuelLevel });
    router.push({ pathname: '/vendor/inspection/exterior', params: { bookingId, type } });
  };

  return (
    <View style={styles.container}>
      <InspectionHeader title={type === 'post' ? 'Post-Rental Inspection' : 'Pre-Rental Inspection'} step={1} />

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
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
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
