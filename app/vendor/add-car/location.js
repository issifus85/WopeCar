import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useAddCar } from '../../../contexts/AddCarContext';
import { GHANA_REGIONS } from '../../../constants/vehicleCatalog';
import VendorWizardHeader from '../../../components/VendorWizardHeader';
import CheckoutFooterButton from '../../../components/CheckoutFooterButton';
import LocationSearchModal from '../../../components/LocationSearchModal';
import SearchableOptionModal from '../../../components/SearchableOptionModal';

export default function AddCarLocationScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { draft, updateDraft } = useAddCar();
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [regionModalOpen, setRegionModalOpen] = useState(false);

  const price = Number(draft.pricePerDay);
  const isValid = !!draft.region && !!draft.location && draft.pricePerDay.toString().trim().length > 0 && price > 0;

  const handleContinue = () => {
    router.push('/vendor/add-car/regional');
  };

  return (
    <View style={styles.container}>
      <VendorWizardHeader title="Location & Pricing" step={2} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>Region</Text>
        <TouchableOpacity style={styles.locationButton} onPress={() => setRegionModalOpen(true)}>
          <Ionicons name="map-outline" size={18} color={colors.teal} />
          <Text style={[styles.locationButtonText, !draft.region && styles.locationPlaceholder]} numberOfLines={1}>
            {draft.region || 'Select region'}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.label, styles.labelSpaced]}>City / Area</Text>
        <TouchableOpacity style={styles.locationButton} onPress={() => setLocationModalOpen(true)}>
          <Ionicons name="location-outline" size={18} color={colors.teal} />
          <Text style={[styles.locationButtonText, !draft.location && styles.locationPlaceholder]} numberOfLines={1}>
            {draft.location || 'Search for a city or area...'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.hint}>This confirms which region and city your car is based in.</Text>

        <Text style={[styles.label, styles.labelSpaced]}>Price per Day (GHS)</Text>
        <TextInput
          style={styles.input}
          value={draft.pricePerDay}
          onChangeText={(value) => updateDraft({ pricePerDay: value })}
          placeholder="e.g. 400"
          placeholderTextColor={colors.textSubtle}
          keyboardType="numeric"
        />
      </ScrollView>

      <CheckoutFooterButton label="Continue" onPress={handleContinue} disabled={!isValid} />
      </KeyboardAvoidingView>

      <LocationSearchModal
        visible={locationModalOpen}
        title="City / Area"
        onClose={() => setLocationModalOpen(false)}
        onSelect={(description) => updateDraft({ location: description })}
      />
      <SearchableOptionModal
        visible={regionModalOpen}
        title="Select Region"
        options={GHANA_REGIONS}
        value={draft.region}
        onSelect={(region) => updateDraft({ region })}
        onClose={() => setRegionModalOpen(false)}
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
    label: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
      marginBottom: 8,
    },
    labelSpaced: {
      marginTop: 20,
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
    hint: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 6,
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
  });
}
