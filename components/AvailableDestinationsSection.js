import { useState, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { formatCurrency } from '../constants/pricing';
import SectionHeading from './SectionHeading';

const COLLAPSED_COUNT = 3;

/**
 * Car Detail's "Available Destinations" section - the regional/custom
 * destination add-ons already configured for this specific car
 * (car.regionalAddons, from cars.regional_addons - see services/carsApi.js's
 * normalizeCar). Presentational only, same shape as FeaturesSection/
 * ReviewsSection/FaqSection: the parent screen already has this data from
 * its one fetchCarById() call, so no fetch happens here.
 *
 * No per-destination region label is rendered - that data isn't stored
 * (a 'region'-category addon's name already IS the region; a 'custom' one
 * carries no region at all), so showing one would mean inventing text.
 */
export default function AvailableDestinationsSection({ addons }) {
  const { colors } = useAppTheme();
  const { activeCurrency } = useCurrency();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [showAll, setShowAll] = useState(false);

  if (!addons?.length) return null;

  const visibleAddons = showAll ? addons : addons.slice(0, COLLAPSED_COUNT);
  const hiddenCount = addons.length - COLLAPSED_COUNT;

  return (
    <View>
      <SectionHeading>Available Destinations</SectionHeading>
      <Text style={styles.subtitle}>This car can be taken to these locations at an additional rate</Text>

      {visibleAddons.map((addon, index) => {
        const isPerDay = addon.type === 'per_day';
        return (
          <View key={`${addon.name}-${index}`} style={styles.row}>
            <Ionicons name="location-outline" size={18} color={colors.teal} />
            <Text style={styles.name} numberOfLines={1}>{addon.name}</Text>
            <Text style={styles.price}>
              + {formatCurrency(addon.price, activeCurrency)}{isPerDay ? '/day' : ' total'}
            </Text>
          </View>
        );
      })}

      {hiddenCount > 0 && (
        <TouchableOpacity onPress={() => setShowAll((v) => !v)} style={styles.toggleButton}>
          <Text style={styles.toggleText}>
            {showAll ? 'Show less' : `Show ${hiddenCount} more destination${hiddenCount === 1 ? '' : 's'}`}
          </Text>
          <Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={14} color={colors.teal} />
        </TouchableOpacity>
      )}

      <View style={styles.infoNote}>
        <Ionicons name="information-circle-outline" size={16} color={colors.teal} />
        <Text style={styles.infoNoteText}>
          Destination rates are added to the base rental price. Select your add-ons during checkout.
        </Text>
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    subtitle: {
      fontFamily: FONTS.regular,
      fontStyle: 'italic',
      fontSize: 12,
      color: colors.textMuted,
      marginTop: -6,
      marginBottom: 14,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 52,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    name: {
      flex: 1,
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    price: {
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.teal,
    },
    toggleButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      marginTop: 12,
      paddingVertical: 8,
    },
    toggleText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.teal,
    },
    infoNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: colors.highlight,
      borderLeftWidth: 3,
      borderLeftColor: colors.teal,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginTop: 12,
    },
    infoNoteText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontStyle: 'italic',
      fontSize: 11,
      color: colors.textMuted,
      lineHeight: 16,
    },
  });
}
