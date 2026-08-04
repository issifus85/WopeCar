import { useMemo } from 'react';
import { StyleSheet, Text, View, TextInput, Switch, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
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

  const handleContinue = () => {
    router.push('/vendor/add-car/vetting');
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
  });
}
