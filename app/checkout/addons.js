import { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { formatCurrency, calculateRentalPricing } from '../../constants/pricing';
import { fetchCarById } from '../../services/carsApi';
import { useCheckout } from '../../contexts/CheckoutContext';
import CheckoutHeader from '../../components/CheckoutHeader';
import CheckoutFooterButton from '../../components/CheckoutFooterButton';

export default function CheckoutAddonsScreen() {
  const { carId } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const { activeCurrency } = useCurrency();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { draft, updateDraft } = useCheckout();

  const [car, setCar] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  // { [addonName]: days } - only per_day addons ever read the day count,
  // but it's harmless to store for every selected addon.
  const [selected, setSelected] = useState(() => {
    const map = {};
    (draft.addons ?? []).forEach((a) => { map[a.name] = a.days; });
    return map;
  });

  useEffect(() => {
    fetchCarById(carId)
      .then(setCar)
      .finally(() => setIsLoading(false));
  }, [carId]);

  // Trip length in billable days - a per-day addon can never apply for more
  // days than the trip itself lasts, and defaults to the full trip (the
  // common case: touring the other region for the whole rental) so cost
  // stays unchanged unless the user actually shortens it.
  const days = useMemo(() => {
    if (!draft.startDate || !draft.endDate || !car) return 0;
    return calculateRentalPricing({
      startDate: draft.startDate,
      endDate: draft.endDate,
      pickupTime: draft.pickupTime,
      returnTime: draft.returnTime,
      drivenBy: car.drivenBy,
      dailyRate: car.pricePerDay,
    }).billableDays;
  }, [draft.startDate, draft.endDate, draft.pickupTime, draft.returnTime, car]);

  const toggleAddon = (addon) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (addon.name in next) {
        delete next[addon.name];
      } else {
        next[addon.name] = Math.max(1, days);
      }
      return next;
    });
  };

  const adjustAddonDays = (name, delta) => {
    setSelected((prev) => {
      const current = prev[name] ?? 1;
      const clamped = Math.min(Math.max(1, current + delta), Math.max(1, days));
      return { ...prev, [name]: clamped };
    });
  };

  const handleContinue = () => {
    updateDraft({ addons: Object.entries(selected).map(([name, addonDays]) => ({ name, days: addonDays })) });
    router.push({ pathname: '/checkout/summary', params: { carId } });
  };

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  const addons = car?.regionalAddons ?? [];

  return (
    <View style={styles.container}>
      <CheckoutHeader title="Travel Add-ons" step={3} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Regional Travel Add-ons</Text>
        <Text style={styles.sectionSubtitle}>
          Select any regions outside the base rental area you plan to drive to.
        </Text>

        {addons.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle-outline" size={28} color={colors.disabled} />
            <Text style={styles.emptyText}>No regional add-ons for this car.</Text>
          </View>
        ) : (
          addons.map((addon) => {
            const isSelected = addon.name in selected;
            const isPerDay = addon.type === 'per_day';
            const addonDays = selected[addon.name] ?? 1;
            return (
              <View key={addon.name} style={[styles.addonRow, isSelected && styles.addonRowSelected]}>
                <TouchableOpacity style={styles.addonToggleRow} onPress={() => toggleAddon(addon)}>
                  <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                    {isSelected && <Ionicons name="checkmark" size={14} color={colors.white} />}
                  </View>
                  <View style={styles.addonInfo}>
                    <Text style={styles.addonName}>{addon.name}</Text>
                    <Text style={styles.addonType}>
                      {isPerDay ? 'Per day' : addon.type === 'per_hour' ? 'Per hour' : addon.type}
                    </Text>
                  </View>
                  <Text style={styles.addonPrice}>
                    +{formatCurrency(addon.price, activeCurrency)}{isPerDay ? '/day' : ''}
                  </Text>
                </TouchableOpacity>

                {isSelected && isPerDay && (
                  <View style={styles.daysStepperRow}>
                    <Text style={styles.daysStepperLabel}>Days in this region</Text>
                    <View style={styles.daysStepper}>
                      <TouchableOpacity
                        style={styles.stepperButton}
                        onPress={() => adjustAddonDays(addon.name, -1)}
                        disabled={addonDays <= 1}
                      >
                        <Ionicons name="remove" size={16} color={addonDays <= 1 ? colors.disabled : colors.teal} />
                      </TouchableOpacity>
                      <Text style={styles.stepperValue}>{addonDays} {addonDays === 1 ? 'day' : 'days'}</Text>
                      <TouchableOpacity
                        style={styles.stepperButton}
                        onPress={() => adjustAddonDays(addon.name, 1)}
                        disabled={addonDays >= Math.max(1, days)}
                      >
                        <Ionicons name="add" size={16} color={addonDays >= Math.max(1, days) ? colors.disabled : colors.teal} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}
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
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 16,
      color: colors.textPrimary,
    },
    sectionSubtitle: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      marginTop: 4,
      marginBottom: 20,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
      gap: 10,
    },
    emptyText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
    },
    addonRow: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    addonRowSelected: {
      borderColor: colors.teal,
      backgroundColor: colors.highlight,
    },
    addonToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    daysStepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    daysStepperLabel: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.textMuted,
    },
    daysStepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    stepperButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperValue: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
      minWidth: 48,
      textAlign: 'center',
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: colors.disabled,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    addonInfo: {
      flex: 1,
    },
    addonName: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    addonType: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
      marginTop: 2,
    },
    addonPrice: {
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.textPrimary,
    },
  });
}
