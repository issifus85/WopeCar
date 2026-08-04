import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useAddCar } from '../../../contexts/AddCarContext';
import {
  VEHICLE_MAKES,
  getModelsForMake,
  MANUFACTURING_YEARS,
  CAR_FEATURES,
  VEHICLE_TYPES,
  VEHICLE_CLASSES,
} from '../../../constants/vehicleCatalog';
import VendorWizardHeader from '../../../components/VendorWizardHeader';
import CheckoutFooterButton from '../../../components/CheckoutFooterButton';
import SearchableOptionModal from '../../../components/SearchableOptionModal';

const DRIVEN_BY_OPTIONS = ['Self-drive', 'Chauffeur'];
const ENERGY_SOURCE_OPTIONS = ['Gasoline', 'Diesel', 'EV'];
const TRANSMISSION_OPTIONS = ['Automatic', 'Manual'];
// Vendor-facing options are the human-readable labels, stored directly (same
// convention as make/model/drivenBy/transmission) - matches how car.type is
// already displayed as-is elsewhere (CarListCard/CarTileCard/car/[id].js),
// not looked up from a slug.
const VEHICLE_TYPE_OPTIONS = VEHICLE_TYPES.map((t) => t.label);
const VEHICLE_CLASS_OPTIONS = VEHICLE_CLASSES.map((c) => c.label);

function PickerField({ label, value, placeholder, onPress, disabled, styles, colors }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.pickerButton, disabled && styles.pickerButtonDisabled]}
        onPress={onPress}
        disabled={disabled}
      >
        <Text style={[styles.pickerButtonText, !value && styles.pickerButtonPlaceholder]}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={disabled ? colors.disabled : colors.textSubtle} />
      </TouchableOpacity>
    </View>
  );
}

export default function AddCarDetailsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { draft, startAddCar, updateDraft } = useAddCar();
  const [pickerOpen, setPickerOpen] = useState(null); // 'make' | 'model' | 'year' | 'type' | 'vehicleClass' | null

  // Every visit to step 1 starts a fresh submission - matches
  // CheckoutContext's startCheckout() reset-on-entry pattern.
  useEffect(() => {
    startAddCar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modelOptions = useMemo(() => getModelsForMake(draft.make), [draft.make]);
  const isValid = !!draft.make && !!draft.model && !!draft.year && !!draft.type && !!draft.vehicleClass && !!draft.drivenBy && !!draft.energySource;

  const handleSelectMake = (make) => {
    // Changing the make invalidates whatever model was picked for the old one.
    updateDraft({ make, model: '' });
  };

  const isFeatureSelected = (feature) => draft.features.some((f) => f.id === feature.id);

  const toggleFeature = (feature) => {
    updateDraft({
      features: isFeatureSelected(feature)
        ? draft.features.filter((f) => f.id !== feature.id)
        : [...draft.features, feature],
    });
  };

  const handleContinue = () => {
    router.push('/vendor/add-car/location');
  };

  return (
    <View style={styles.container}>
      <VendorWizardHeader title="Vehicle Details" step={1} onBack={() => router.push('/vendor/fleet')} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <PickerField
          label="Car Make"
          value={draft.make}
          placeholder="Select make"
          onPress={() => setPickerOpen('make')}
          styles={styles}
          colors={colors}
        />
        <PickerField
          label="Car Model"
          value={draft.model}
          placeholder={draft.make ? 'Select model' : 'Select a make first'}
          onPress={() => setPickerOpen('model')}
          disabled={!draft.make}
          styles={styles}
          colors={colors}
        />
        <PickerField
          label="Manufacturing Year"
          value={draft.year}
          placeholder="Select year"
          onPress={() => setPickerOpen('year')}
          styles={styles}
          colors={colors}
        />
        <PickerField
          label="Vehicle Type"
          value={draft.type}
          placeholder="Select type"
          onPress={() => setPickerOpen('type')}
          styles={styles}
          colors={colors}
        />
        <PickerField
          label="Vehicle Class"
          value={draft.vehicleClass}
          placeholder="Select class"
          onPress={() => setPickerOpen('vehicleClass')}
          styles={styles}
          colors={colors}
        />

        <View style={styles.field}>
          <Text style={styles.label}>Driven By</Text>
          <View style={styles.pillsRow}>
            {DRIVEN_BY_OPTIONS.map((option) => {
              const active = option === draft.drivenBy;
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => updateDraft({ drivenBy: option })}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>{option}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Energy Source</Text>
          <View style={styles.pillsRow}>
            {ENERGY_SOURCE_OPTIONS.map((option) => {
              const active = option === draft.energySource;
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => updateDraft({ energySource: option })}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>{option}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Transmission</Text>
          <View style={styles.pillsRow}>
            {TRANSMISSION_OPTIONS.map((option) => {
              const active = option === draft.transmission;
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => updateDraft({ transmission: option })}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>{option}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <View style={styles.specsRow}>
            <View style={styles.specField}>
              <Text style={styles.label}>Total Seats</Text>
              <TextInput
                style={styles.input}
                value={draft.seats}
                onChangeText={(seats) => updateDraft({ seats })}
                placeholder="e.g. 5"
                placeholderTextColor={colors.textSubtle}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.specField}>
              <Text style={styles.label}>Total Doors</Text>
              <TextInput
                style={styles.input}
                value={draft.doors}
                onChangeText={(doors) => updateDraft({ doors })}
                placeholder="e.g. 4"
                placeholderTextColor={colors.textSubtle}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.specField}>
              <Text style={styles.label}>Trunk Size (Bags)</Text>
              <TextInput
                style={styles.input}
                value={draft.baggage}
                onChangeText={(baggage) => updateDraft({ baggage })}
                placeholder="e.g. 2"
                placeholderTextColor={colors.textSubtle}
                keyboardType="number-pad"
              />
            </View>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Features</Text>
          <Text style={styles.hint}>Select everything this car comes with.</Text>
          <View style={styles.featuresGrid}>
            {CAR_FEATURES.map((feature) => {
              const selected = isFeatureSelected(feature);
              return (
                <TouchableOpacity
                  key={feature.id}
                  style={[styles.featureChip, selected && styles.featureChipActive]}
                  onPress={() => toggleFeature(feature)}
                >
                  <Ionicons
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={16}
                    color={selected ? colors.white : colors.textSubtle}
                  />
                  <Text style={[styles.featureChipText, selected && styles.featureChipTextActive]} numberOfLines={1}>
                    {feature.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <Text style={styles.hint}>Shown to renters on your listing. Edit the outline below to fit your car.</Text>
          <TextInput
            style={styles.descriptionInput}
            value={draft.description}
            onChangeText={(description) => updateDraft({ description })}
            multiline
            textAlignVertical="top"
            placeholder="Describe your car..."
            placeholderTextColor={colors.textSubtle}
          />
        </View>
      </ScrollView>

      <CheckoutFooterButton label="Continue" onPress={handleContinue} disabled={!isValid} />
      </KeyboardAvoidingView>

      <SearchableOptionModal
        visible={pickerOpen === 'make'}
        title="Select Make"
        options={VEHICLE_MAKES.map((m) => m.make)}
        value={draft.make}
        onSelect={handleSelectMake}
        onClose={() => setPickerOpen(null)}
      />
      <SearchableOptionModal
        visible={pickerOpen === 'model'}
        title="Select Model"
        options={modelOptions}
        value={draft.model}
        onSelect={(model) => updateDraft({ model })}
        onClose={() => setPickerOpen(null)}
        emptyText="Select a make first."
      />
      <SearchableOptionModal
        visible={pickerOpen === 'year'}
        title="Select Year"
        options={MANUFACTURING_YEARS}
        value={draft.year}
        onSelect={(year) => updateDraft({ year })}
        onClose={() => setPickerOpen(null)}
      />
      <SearchableOptionModal
        visible={pickerOpen === 'type'}
        title="Select Vehicle Type"
        options={VEHICLE_TYPE_OPTIONS}
        value={draft.type}
        onSelect={(type) => updateDraft({ type })}
        onClose={() => setPickerOpen(null)}
      />
      <SearchableOptionModal
        visible={pickerOpen === 'vehicleClass'}
        title="Select Vehicle Class"
        options={VEHICLE_CLASS_OPTIONS}
        value={draft.vehicleClass}
        onSelect={(vehicleClass) => updateDraft({ vehicleClass })}
        onClose={() => setPickerOpen(null)}
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
    field: {
      marginBottom: 20,
    },
    label: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
      marginBottom: 8,
    },
    hint: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: -4,
      marginBottom: 8,
    },
    specsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    specField: {
      flex: 1,
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textPrimary,
    },
    featuresGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    featureChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      width: '47%',
    },
    featureChipActive: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    featureChipText: {
      flex: 1,
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.textMuted,
    },
    featureChipTextActive: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
    },
    descriptionInput: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 13,
      minHeight: 160,
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textPrimary,
    },
    pickerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    pickerButtonDisabled: {
      opacity: 0.5,
    },
    pickerButtonText: {
      fontFamily: FONTS.medium,
      fontSize: 14,
      color: colors.textPrimary,
    },
    pickerButtonPlaceholder: {
      fontFamily: FONTS.regular,
      color: colors.textSubtle,
    },
    pillsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    pill: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    pillActive: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    pillText: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textMuted,
    },
    pillTextActive: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
    },
  });
}
