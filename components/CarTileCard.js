import { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { formatCurrency } from '../constants/pricing';
import ImageGallery from './ImageGallery';

export default function CarTileCard({ car, onPress }) {
  const { colors } = useAppTheme();
  const { activeCurrency } = useCurrency();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      <ImageGallery images={car.gallery} height={190} borderRadius={0} />

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{car.name}</Text>
          {car.type ? (
            <View style={styles.typeBadge}>
              <Text style={styles.typeText}>{car.type}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.location} numberOfLines={1}>📍 {car.location}</Text>
        {car.drivenBy ? (
          <View style={styles.driveBadgeRow}>
            <View style={[
              styles.driveBadge,
              car.drivenBy === 'Chauffeur' && styles.driveBadgeChauffeur,
            ]}>
              <Ionicons
                name={car.drivenBy === 'Chauffeur' ? 'person' : 'key-outline'}
                size={11}
                color={car.drivenBy === 'Chauffeur' ? colors.orange : colors.mauve}
              />
              <Text style={[
                styles.driveBadgeText,
                car.drivenBy === 'Chauffeur' && styles.driveBadgeTextChauffeur,
              ]}>
                {car.drivenBy === 'Chauffeur' ? 'Chauffeur Only' : 'Self-Drive'}
              </Text>
            </View>
          </View>
        ) : null}
        <View style={styles.bottomRow}>
          <Text style={styles.price}>{formatCurrency(car.pricePerDay, activeCurrency)}<Text style={styles.priceLabel}>/day</Text></Text>
          <View style={[
            styles.availabilityBadge,
            { backgroundColor: car.isAvailable ? colors.successBg : colors.errorBg }
          ]}>
            <Text style={[
              styles.availabilityText,
              { color: car.isAvailable ? colors.success : colors.error }
            ]}>
              {car.isAvailable ? 'Available' : 'Unavailable'}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      marginBottom: 16,
      overflow: 'hidden',
      shadowColor: colors.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 4,
    },
    info: {
      padding: 14,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    name: {
      fontFamily: FONTS.bold,
      fontSize: 17,
      color: colors.textPrimary,
      flexShrink: 1,
    },
    typeBadge: {
      backgroundColor: colors.highlight,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
    },
    typeText: {
      fontFamily: FONTS.semiBold,
      fontSize: 10,
      color: colors.teal,
    },
    driveBadgeRow: {
      flexDirection: 'row',
      marginTop: 6,
    },
    driveBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: '#F5EBE7',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
    },
    driveBadgeChauffeur: {
      backgroundColor: '#FDECE3',
    },
    driveBadgeText: {
      fontFamily: FONTS.semiBold,
      fontSize: 10,
      color: colors.mauve,
    },
    driveBadgeTextChauffeur: {
      color: colors.orange,
    },
    location: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 4,
    },
    bottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
    },
    price: {
      fontFamily: FONTS.bold,
      fontSize: 20,
      color: colors.teal,
    },
    priceLabel: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
    },
    availabilityBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    availabilityText: {
      fontFamily: FONTS.semiBold,
      fontSize: 11,
    },
  });
}
