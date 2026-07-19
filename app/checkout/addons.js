import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../constants/theme';
import { formatCurrency } from '../../constants/pricing';
import { fetchCarById } from '../../services/carsApi';
import { useCheckout } from '../../contexts/CheckoutContext';
import CheckoutHeader from '../../components/CheckoutHeader';
import CheckoutFooterButton from '../../components/CheckoutFooterButton';

export default function CheckoutAddonsScreen() {
  const { carId } = useLocalSearchParams();
  const router = useRouter();
  const { draft, updateDraft } = useCheckout();

  const [car, setCar] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState(new Set(draft.addonNames));

  useEffect(() => {
    fetchCarById(carId)
      .then(setCar)
      .finally(() => setIsLoading(false));
  }, [carId]);

  const toggleAddon = (name) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleContinue = () => {
    updateDraft({ addonNames: [...selected] });
    router.push({ pathname: '/checkout/summary', params: { carId } });
  };

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={COLORS.teal} />
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
            <Ionicons name="checkmark-circle-outline" size={28} color="#ccc" />
            <Text style={styles.emptyText}>No regional add-ons for this car.</Text>
          </View>
        ) : (
          addons.map((addon) => {
            const isSelected = selected.has(addon.name);
            return (
              <TouchableOpacity
                key={addon.name}
                style={[styles.addonRow, isSelected && styles.addonRowSelected]}
                onPress={() => toggleAddon(addon.name)}
              >
                <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                  {isSelected && <Ionicons name="checkmark" size={14} color="#ffffff" />}
                </View>
                <View style={styles.addonInfo}>
                  <Text style={styles.addonName}>{addon.name}</Text>
                  <Text style={styles.addonType}>
                    {addon.type === 'per_day' ? 'Per day' : addon.type === 'per_hour' ? 'Per hour' : addon.type}
                  </Text>
                </View>
                <Text style={styles.addonPrice}>+{formatCurrency(addon.price)}</Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <CheckoutFooterButton label="Continue" onPress={handleContinue} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
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
    color: COLORS.navy,
  },
  sectionSubtitle: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#888',
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
    color: '#999',
  },
  addonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  addonRowSelected: {
    borderColor: COLORS.teal,
    backgroundColor: '#EEF9F9',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.teal,
    borderColor: COLORS.teal,
  },
  addonInfo: {
    flex: 1,
  },
  addonName: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    color: COLORS.navy,
  },
  addonType: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  addonPrice: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.teal,
  },
});
