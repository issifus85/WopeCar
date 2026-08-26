import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Switch, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useAddCar } from '../../../contexts/AddCarContext';
import { GHANA_REGIONS } from '../../../constants/vehicleCatalog';
import VendorWizardHeader from '../../../components/VendorWizardHeader';
import CheckoutFooterButton from '../../../components/CheckoutFooterButton';

export default function AddCarRegionalScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { draft, updateDraft } = useAddCar();

  // Freeform destinations beyond the fixed 16 regions - kept as separate
  // in-progress row state (not written into draft.regionalAddons until
  // Continue, same as CarDiscountEditor's tier rows) since a half-typed
  // row (name but no price yet) shouldn't already be part of the saved
  // add-ons list. Each entry only carries category:'custom' once merged
  // in on Continue - region entries get category:'region' at the same
  // point, so draft.regionalAddons itself never needs a category while
  // still being edited here.
  const [customDestinations, setCustomDestinations] = useState([]);
  const [customErrors, setCustomErrors] = useState({});

  const isRegionEnabled = (region) => draft.regionalAddons.some((r) => r.name === region);
  const priceForRegion = (region) => draft.regionalAddons.find((r) => r.name === region)?.price ?? '';

  const toggleRegion = (region, enabled) => {
    if (enabled) {
      updateDraft({ regionalAddons: [...draft.regionalAddons, { name: region, price: '', type: 'per_day' }] });
    } else {
      updateDraft({ regionalAddons: draft.regionalAddons.filter((r) => r.name !== region) });
    }
  };

  const setPriceForRegion = (region, price) => {
    updateDraft({
      regionalAddons: draft.regionalAddons.map((r) => (r.name === region ? { ...r, price } : r)),
    });
  };

  const addCustomDestination = () => {
    setCustomErrors({});
    setCustomDestinations([...customDestinations, { name: '', price: '' }]);
  };
  const updateCustomDestination = (index, patch) => {
    setCustomErrors({});
    setCustomDestinations(customDestinations.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };
  const removeCustomDestination = (index) => {
    setCustomErrors({});
    setCustomDestinations(customDestinations.filter((_, i) => i !== index));
  };

  // Runs at Continue, not on every keystroke - a half-typed row is normal
  // mid-edit, not an error. Duplicate names are checked against the full
  // 16-region list (regardless of toggle state) and every other custom
  // row, case-insensitively. A fully blank row (never touched after
  // tapping "+ Add") is silently dropped rather than flagged.
  const validateCustomDestinations = () => {
    const errors = {};
    const cleaned = [];
    const seenNames = new Set();
    customDestinations.forEach((d, index) => {
      const name = d.name.trim();
      const priceStr = String(d.price ?? '').trim();
      const priceNum = Number(priceStr);
      const hasName = name.length > 0;
      const hasPrice = priceStr.length > 0 && !Number.isNaN(priceNum) && priceNum > 0;

      if (!hasName && !hasPrice) return;
      if (!hasName || !hasPrice) {
        errors[index] = 'Please complete or remove this destination';
        return;
      }

      const lower = name.toLowerCase();
      if (GHANA_REGIONS.some((r) => r.toLowerCase() === lower) || seenNames.has(lower)) {
        errors[index] = 'This destination already exists';
        return;
      }
      seenNames.add(lower);
      cleaned.push({ name, price: priceNum });
    });
    setCustomErrors(errors);
    return { valid: Object.keys(errors).length === 0, cleaned };
  };

  const handleContinue = () => {
    const { valid, cleaned } = validateCustomDestinations();
    if (!valid) return;

    const regionEntries = draft.regionalAddons.map((r) => ({ ...r, category: 'region' }));
    const customEntries = cleaned.map((c) => ({ name: c.name, price: c.price, type: 'per_day', category: 'custom' }));
    updateDraft({ regionalAddons: [...regionEntries, ...customEntries] });
    router.push('/vendor/add-car/documents');
  };

  return (
    <View style={styles.container}>
      <VendorWizardHeader title="Regional Add-on Pricing" step={3} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.masterRow}>
          <View style={styles.masterLabelWrap}>
            <Text style={styles.masterLabel}>Offer Regional Add-ons</Text>
            <Text style={styles.masterSubtitle}>Let renters take this car to other regions for a daily fee</Text>
          </View>
          <Switch
            value={draft.offersRegionalAddons}
            onValueChange={(value) => updateDraft({ offersRegionalAddons: value })}
            trackColor={{ false: colors.disabled, true: colors.teal }}
            thumbColor={colors.white}
          />
        </View>

        {draft.offersRegionalAddons && (
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

            <View style={styles.customSectionDivider} />
            <Text style={styles.customSectionTitle}>Custom Destinations</Text>
            <Text style={styles.cardHint}>Add specific cities or destinations not covered by the regions above</Text>

            {customDestinations.map((destination, index) => {
              const error = customErrors[index];
              return (
                <View key={index} style={styles.customRow}>
                  <View style={styles.customFieldsRow}>
                    <View style={styles.customNameField}>
                      <Text style={styles.tierLabel}>Destination</Text>
                      <TextInput
                        style={[styles.input, !!error && styles.inputError]}
                        value={destination.name}
                        onChangeText={(value) => updateCustomDestination(index, { name: value })}
                        placeholder="e.g. Peduase"
                        placeholderTextColor={colors.textSubtle}
                      />
                    </View>
                    <View style={styles.customPriceField}>
                      <Text style={styles.tierLabel}>Price (GHS)</Text>
                      <TextInput
                        style={[styles.input, !!error && styles.inputError]}
                        value={String(destination.price ?? '')}
                        onChangeText={(value) => updateCustomDestination(index, { price: value })}
                        placeholder="0"
                        placeholderTextColor={colors.textSubtle}
                        keyboardType="numeric"
                      />
                    </View>
                    <TouchableOpacity style={styles.customRemove} onPress={() => removeCustomDestination(index)} hitSlop={10}>
                      <Ionicons name="trash-outline" size={18} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                  {!!error && <Text style={styles.customRowError}>{error}</Text>}
                </View>
              );
            })}

            <TouchableOpacity style={styles.addLink} onPress={addCustomDestination}>
              <Ionicons name="add-circle-outline" size={16} color={colors.teal} />
              <Text style={styles.addLinkText}>Add City or Destination</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <CheckoutFooterButton label="Continue" onPress={handleContinue} />
      </KeyboardAvoidingView>
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
    customSectionDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      marginTop: 4,
      marginBottom: 14,
    },
    customSectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 12,
      color: colors.textSubtle,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    customRow: {
      paddingVertical: 10,
    },
    customFieldsRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
    },
    customNameField: {
      flex: 1.4,
    },
    customPriceField: {
      flex: 1,
    },
    tierLabel: {
      fontFamily: FONTS.regular,
      fontSize: 10,
      color: colors.textSubtle,
      marginBottom: 6,
    },
    input: {
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
    inputError: {
      borderColor: colors.error,
    },
    customRemove: {
      paddingBottom: 10,
    },
    customRowError: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.error,
      marginTop: 4,
    },
    addLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
    },
    addLinkText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.teal,
    },
  });
}
