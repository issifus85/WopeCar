import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Switch, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../../constants/theme';
import { useAppTheme } from '../../../../contexts/ThemeContext';
import { useVendor } from '../../../../contexts/VendorContext';
import {
  VEHICLE_MAKES,
  getModelsForMake,
  MANUFACTURING_YEARS,
  CAR_FEATURES,
  GHANA_REGIONS,
  VEHICLE_TYPES,
  VEHICLE_CLASSES,
} from '../../../../constants/vehicleCatalog';
import VendorHeader from '../../../../components/VendorHeader';
import CheckoutFooterButton from '../../../../components/CheckoutFooterButton';
import SearchableOptionModal from '../../../../components/SearchableOptionModal';
import LocationSearchModal from '../../../../components/LocationSearchModal';

const DRIVEN_BY_OPTIONS = ['Self-drive', 'Chauffeur'];
const ENERGY_SOURCE_OPTIONS = ['Gasoline', 'Diesel', 'EV'];
const TRANSMISSION_OPTIONS = ['Automatic', 'Manual'];
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

// Full-listing counterpart to the Add Car wizard - every field a vendor sets
// when creating a listing (app/vendor/add-car/*) is editable here too, in one
// scrollable form rather than a multi-step flow, since there's no submission
// order to enforce on an edit. Uses the same field names/shapes as addCar()
// so nothing needs translating on save.
export default function VendorEditListingScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { cars, isLoading, updateCar } = useVendor();

  const car = cars.find((c) => c.id === id);

  const [pickerOpen, setPickerOpen] = useState(null); // 'make' | 'model' | 'year' | 'type' | 'vehicleClass' | null
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  // VendorContext loads its data asynchronously (from SecureStore/localStorage),
  // so if this screen is the first thing to mount - a deep link, or the app
  // resuming here after being backgrounded - `car` can still be undefined on
  // the very first render. useState's initializer only runs once, so seeding
  // these fields directly from `car` would leave them permanently blank in
  // that case. Instead they start empty and a one-time effect below fills
  // them in from the real saved car the moment it's available, so editing
  // always starts from what's actually stored, never a blank form.
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState(null);
  const [type, setType] = useState('');
  const [vehicleClass, setVehicleClass] = useState('');
  const [drivenBy, setDrivenBy] = useState('Self-drive');
  const [energySource, setEnergySource] = useState('');
  const [transmission, setTransmission] = useState('Automatic');
  const [seats, setSeats] = useState('');
  const [doors, setDoors] = useState('');
  const [baggage, setBaggage] = useState('');
  const [features, setFeatures] = useState([]);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [pricePerDay, setPricePerDay] = useState('');
  const [regionalAddons, setRegionalAddons] = useState([]);
  const [offersRegionalAddons, setOffersRegionalAddons] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isInitialized || !car) return;
    setMake(car.make ?? '');
    setModel(car.model ?? '');
    setYear(car.year ?? null);
    setType(car.type ?? '');
    setVehicleClass(car.vehicleClass ?? '');
    setDrivenBy(car.drivenBy ?? 'Self-drive');
    setEnergySource(car.energySource ?? '');
    setTransmission(car.transmission ?? 'Automatic');
    setSeats(car.seats != null ? String(car.seats) : '');
    setDoors(car.doors != null ? String(car.doors) : '');
    setBaggage(car.baggage != null ? String(car.baggage) : '');
    setFeatures(car.features ?? []);
    setDescription(car.description ?? '');
    setLocation(car.location ?? '');
    setPricePerDay(car.pricePerDay != null ? String(car.pricePerDay) : '');
    setRegionalAddons(car.regionalAddons ?? []);
    setOffersRegionalAddons((car.regionalAddons ?? []).length > 0);
    setIsInitialized(true);
  }, [car, isInitialized]);

  const modelOptions = useMemo(() => getModelsForMake(make), [make]);

  if (isLoading || (car && !isInitialized)) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  if (!car) {
    return (
      <View style={styles.container}>
        <VendorHeader title="Edit Listing" onBack={() => router.back()} />
        <View style={styles.centerState}>
          <Text style={styles.emptyText}>This car couldn't be found.</Text>
        </View>
      </View>
    );
  }

  const handleSelectMake = (newMake) => {
    // Changing the make invalidates whatever model was picked for the old one.
    setMake(newMake);
    setModel('');
  };

  const isFeatureSelected = (feature) => features.some((f) => f.id === feature.id);

  const toggleFeature = (feature) => {
    setFeatures(
      isFeatureSelected(feature)
        ? features.filter((f) => f.id !== feature.id)
        : [...features, feature]
    );
  };

  const isRegionEnabled = (region) => regionalAddons.some((r) => r.name === region);
  const priceForRegion = (region) => regionalAddons.find((r) => r.name === region)?.price ?? '';

  const toggleRegion = (region, enabled) => {
    if (enabled) {
      setRegionalAddons([...regionalAddons, { name: region, price: '', type: 'per_day' }]);
    } else {
      setRegionalAddons(regionalAddons.filter((r) => r.name !== region));
    }
  };

  const setPriceForRegion = (region, price) => {
    setRegionalAddons(regionalAddons.map((r) => (r.name === region ? { ...r, price } : r)));
  };

  const price = Number(pricePerDay);
  const isValid = !!make && !!model && !!year && !!type && !!vehicleClass && !!drivenBy && !!energySource && !!location && pricePerDay.trim().length > 0 && price > 0;

  const handleSave = async () => {
    const enabledRegions = offersRegionalAddons ? regionalAddons.filter((r) => Number(r.price) > 0) : [];
    setIsSaving(true);
    try {
      await updateCar(car.id, {
        name: `${make} ${model} ${year}`,
        make,
        model,
        year,
        type,
        vehicleClass,
        drivenBy,
        energySource,
        transmission,
        seats: seats ? Number(seats) : null,
        doors: doors ? Number(doors) : null,
        baggage: baggage ? Number(baggage) : null,
        features,
        description: description.trim(),
        location,
        pricePerDay: price,
        regionalAddons: enabledRegions.map((r) => ({ name: r.name, price: Number(r.price), type: 'per_day' })),
      });
      router.back();
    } catch (e) {
      Alert.alert('Could not save changes', e?.message || 'Please check your connection and try again.');
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <VendorHeader title="Edit Listing" subtitle={car.name} onBack={() => router.back()} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>Vehicle</Text>
          <PickerField
            label="Car Make"
            value={make}
            placeholder="Select make"
            onPress={() => setPickerOpen('make')}
            styles={styles}
            colors={colors}
          />
          <PickerField
            label="Car Model"
            value={model}
            placeholder={make ? 'Select model' : 'Select a make first'}
            onPress={() => setPickerOpen('model')}
            disabled={!make}
            styles={styles}
            colors={colors}
          />
          <PickerField
            label="Manufacturing Year"
            value={year}
            placeholder="Select year"
            onPress={() => setPickerOpen('year')}
            styles={styles}
            colors={colors}
          />
          <PickerField
            label="Vehicle Type"
            value={type}
            placeholder="Select type"
            onPress={() => setPickerOpen('type')}
            styles={styles}
            colors={colors}
          />
          <PickerField
            label="Vehicle Class"
            value={vehicleClass}
            placeholder="Select class"
            onPress={() => setPickerOpen('vehicleClass')}
            styles={styles}
            colors={colors}
          />

          <View style={styles.field}>
            <Text style={styles.label}>Driven By</Text>
            <View style={styles.pillsRow}>
              {DRIVEN_BY_OPTIONS.map((option) => {
                const active = option === drivenBy;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.pill, active && styles.pillActive]}
                    onPress={() => setDrivenBy(option)}
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
                const active = option === energySource;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.pill, active && styles.pillActive]}
                    onPress={() => setEnergySource(option)}
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
                const active = option === transmission;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.pill, active && styles.pillActive]}
                    onPress={() => setTransmission(option)}
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
                  value={seats}
                  onChangeText={setSeats}
                  placeholder="e.g. 5"
                  placeholderTextColor={colors.textSubtle}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.specField}>
                <Text style={styles.label}>Total Doors</Text>
                <TextInput
                  style={styles.input}
                  value={doors}
                  onChangeText={setDoors}
                  placeholder="e.g. 4"
                  placeholderTextColor={colors.textSubtle}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.specField}>
                <Text style={styles.label}>Trunk Size (Bags)</Text>
                <TextInput
                  style={styles.input}
                  value={baggage}
                  onChangeText={setBaggage}
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
            <Text style={styles.hint}>Shown to renters on your listing.</Text>
            <TextInput
              style={styles.descriptionInput}
              value={description}
              onChangeText={setDescription}
              multiline
              textAlignVertical="top"
              placeholder="Describe your car..."
              placeholderTextColor={colors.textSubtle}
            />
          </View>

          <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Location & Pricing</Text>
          <View style={styles.field}>
            <Text style={styles.label}>Vehicle Location</Text>
            <TouchableOpacity style={styles.locationButton} onPress={() => setLocationModalOpen(true)}>
              <Ionicons name="location-outline" size={18} color={colors.teal} />
              <Text style={[styles.locationButtonText, !location && styles.locationPlaceholder]} numberOfLines={1}>
                {location || 'Search for a region or city...'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Price per Day (GHS)</Text>
            <TextInput
              style={styles.input}
              value={pricePerDay}
              onChangeText={setPricePerDay}
              placeholder="e.g. 400"
              placeholderTextColor={colors.textSubtle}
              keyboardType="numeric"
            />
          </View>

          <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Regional Add-ons</Text>
          <View style={styles.masterRow}>
            <View style={styles.masterLabelWrap}>
              <Text style={styles.masterLabel}>Offer Regional Add-ons</Text>
              <Text style={styles.masterSubtitle}>Let renters take this car to other regions for a daily fee</Text>
            </View>
            <Switch
              value={offersRegionalAddons}
              onValueChange={setOffersRegionalAddons}
              trackColor={{ false: colors.disabled, true: colors.teal }}
              thumbColor={colors.white}
            />
          </View>

          {offersRegionalAddons && (
            <View style={styles.card}>
              <Text style={styles.cardHint}>
                Turn on each region this car can be driven to, and set the extra price charged per day spent there.
              </Text>
              {GHANA_REGIONS.map((region, index) => {
                const enabled = isRegionEnabled(region);
                return (
                  <View key={region} style={[styles.regionRow, index === GHANA_REGIONS.length - 1 && styles.regionRowLast]}>
                    <View style={styles.regionTopRow}>
                      <Text style={styles.regionName}>{region}</Text>
                      <Switch
                        value={enabled}
                        onValueChange={(value) => toggleRegion(region, value)}
                        trackColor={{ false: colors.disabled, true: colors.teal }}
                        thumbColor={colors.white}
                      />
                    </View>
                    {enabled && (
                      <TextInput
                        style={styles.priceInput}
                        value={priceForRegion(region)}
                        onChangeText={(value) => setPriceForRegion(region, value)}
                        placeholder="Price per day (GHS)"
                        placeholderTextColor={colors.textSubtle}
                        keyboardType="numeric"
                      />
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        <CheckoutFooterButton
          label={isSaving ? 'Saving...' : 'Save Changes'}
          onPress={handleSave}
          disabled={!isValid || isSaving}
        />
      </KeyboardAvoidingView>

      <SearchableOptionModal
        visible={pickerOpen === 'make'}
        title="Select Make"
        options={VEHICLE_MAKES.map((m) => m.make)}
        value={make}
        onSelect={handleSelectMake}
        onClose={() => setPickerOpen(null)}
      />
      <SearchableOptionModal
        visible={pickerOpen === 'model'}
        title="Select Model"
        options={modelOptions}
        value={model}
        onSelect={(newModel) => setModel(newModel)}
        onClose={() => setPickerOpen(null)}
        emptyText="Select a make first."
      />
      <SearchableOptionModal
        visible={pickerOpen === 'year'}
        title="Select Year"
        options={MANUFACTURING_YEARS}
        value={year}
        onSelect={(newYear) => setYear(newYear)}
        onClose={() => setPickerOpen(null)}
      />
      <SearchableOptionModal
        visible={pickerOpen === 'type'}
        title="Select Vehicle Type"
        options={VEHICLE_TYPE_OPTIONS}
        value={type}
        onSelect={(newType) => setType(newType)}
        onClose={() => setPickerOpen(null)}
      />
      <SearchableOptionModal
        visible={pickerOpen === 'vehicleClass'}
        title="Select Vehicle Class"
        options={VEHICLE_CLASS_OPTIONS}
        value={vehicleClass}
        onSelect={(newVehicleClass) => setVehicleClass(newVehicleClass)}
        onClose={() => setPickerOpen(null)}
      />
      <LocationSearchModal
        visible={locationModalOpen}
        title="Vehicle Location"
        onClose={() => setLocationModalOpen(false)}
        onSelect={(description) => setLocation(description)}
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
    sectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.textSubtle,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 14,
    },
    sectionSpaced: {
      marginTop: 8,
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
    locationButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    locationButtonText: {
      flex: 1,
      fontFamily: FONTS.medium,
      fontSize: 14,
      color: colors.textPrimary,
    },
    locationPlaceholder: {
      fontFamily: FONTS.regular,
      color: colors.textSubtle,
    },
    masterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    masterLabelWrap: {
      flex: 1,
    },
    masterLabel: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    masterSubtitle: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 2,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    cardHint: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginBottom: 12,
      lineHeight: 17,
    },
    regionRow: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
      gap: 10,
    },
    regionRowLast: {
      borderBottomWidth: 0,
    },
    regionTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    regionName: {
      fontFamily: FONTS.medium,
      fontSize: 14,
      color: colors.textPrimary,
    },
    priceInput: {
      backgroundColor: colors.background,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textPrimary,
    },
  });
}
