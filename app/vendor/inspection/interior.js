import { useMemo } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useInspection } from '../../../contexts/InspectionContext';
import InspectionHeader from '../../../components/InspectionHeader';
import CheckoutFooterButton from '../../../components/CheckoutFooterButton';

// Mirrors the client's official Vehicle Inspection Checklist PDF, same as
// app/inspection/interior.js.
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

function CheckItem({ label, checked, onToggle, styles, colors }) {
  return (
    <TouchableOpacity style={styles.checkboxRow} onPress={onToggle}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Ionicons name="checkmark" size={14} color={colors.white} />}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// Vendor Mode variant of app/inspection/interior.js - see mileage.js's
// header comment for why this is a separate, backend-free copy.
export default function VendorInspectionInteriorScreen() {
  const { bookingId, type } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { draft, updateDraft } = useInspection();

  const checklist = draft.checklist;

  const toggleItem = (key) => {
    updateDraft({ checklist: { ...checklist, [key]: !checklist[key] } });
  };

  const setNotes = (notes) => {
    updateDraft({ checklist: { ...checklist, notes } });
  };

  const handleContinue = () => {
    router.push({ pathname: '/vendor/inspection/photos', params: { bookingId, type } });
  };

  return (
    <View style={styles.container}>
      <InspectionHeader title="Vehicle Checklist" step={3} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {SECTIONS.map((section) => (
          <View key={section.title}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item) => (
              <CheckItem
                key={item.key}
                label={item.label}
                checked={!!checklist[item.key]}
                onToggle={() => toggleItem(item.key)}
                styles={styles}
                colors={colors}
              />
            ))}
          </View>
        ))}

        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={styles.notesInput}
          value={checklist.notes}
          onChangeText={setNotes}
          placeholder="Anything else worth noting..."
          placeholderTextColor={colors.textSubtle}
          multiline
        />

      </ScrollView>

      <CheckoutFooterButton label="Continue" onPress={handleContinue} />
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
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 14,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: colors.disabled,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    checkboxChecked: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    checkboxLabel: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textPrimary,
    },
    label: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
      marginBottom: 8,
      marginTop: 8,
    },
    notesInput: {
      fontFamily: FONTS.regular,
      backgroundColor: colors.background,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 14,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.textPrimary,
      minHeight: 90,
      textAlignVertical: 'top',
    },
  });
}
