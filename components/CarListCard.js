import { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { formatCurrency, isBlanketDiscountActive, applyBlanketDiscount } from '../constants/pricing';

export default function CarListCard({ car, onPress }) {
  const { colors } = useAppTheme();
  const { activeCurrency } = useCurrency();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const hasActiveDiscount = isBlanketDiscountActive(car.discount);
  const discountedPricePerDay = hasActiveDiscount ? applyBlanketDiscount(car.pricePerDay, car.discount) : car.pricePerDay;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      {car.image ? (
        <Image source={{ uri: car.image }} style={styles.image} contentFit="cover" />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Text style={styles.imagePlaceholderText}>🚗</Text>
        </View>
      )}

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
                size={10}
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
          <View style={styles.priceValueRow}>
            {hasActiveDiscount && (
              <Text style={styles.priceStrikethrough}>{formatCurrency(car.pricePerDay, activeCurrency)}</Text>
            )}
            <Text style={styles.price}>{formatCurrency(discountedPricePerDay, activeCurrency)}<Text style={styles.priceLabel}>/day</Text></Text>
          </View>
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
      borderRadius: 12,
      marginBottom: 12,
      flexDirection: 'row',
      overflow: 'hidden',
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    image: {
      width: 110,
      height: 130,
    },
    imagePlaceholder: {
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    imagePlaceholderText: {
      fontSize: 32,
    },
    info: {
      flex: 1,
      padding: 12,
      justifyContent: 'space-between',
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
    },
    name: {
      fontFamily: FONTS.bold,
      fontSize: 15,
      color: colors.textPrimary,
      flexShrink: 1,
    },
    typeBadge: {
      backgroundColor: colors.highlight,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    typeText: {
      fontFamily: FONTS.semiBold,
      fontSize: 9,
      color: colors.teal,
    },
    driveBadgeRow: {
      flexDirection: 'row',
      marginTop: 4,
    },
    // Decorative accent-tint badges - kept constant across themes like the
    // brand colors they pair with, rather than added as new surface tokens.
    driveBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#F5EBE7',
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 4,
    },
    driveBadgeChauffeur: {
      backgroundColor: '#FDECE3',
    },
    driveBadgeText: {
      fontFamily: FONTS.semiBold,
      fontSize: 9,
      color: colors.mauve,
    },
    driveBadgeTextChauffeur: {
      color: colors.orange,
    },
    location: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    bottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 6,
    },
    priceValueRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 5,
      flexShrink: 1,
      flexWrap: 'wrap',
    },
    priceStrikethrough: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
      textDecorationLine: 'line-through',
    },
    price: {
      fontFamily: FONTS.bold,
      fontSize: 17,
      color: colors.teal,
    },
    priceLabel: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
    },
    availabilityBadge: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
    },
    availabilityText: {
      fontFamily: FONTS.semiBold,
      fontSize: 10,
    },
  });
}
