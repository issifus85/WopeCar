import { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { formatCurrency, isAnyDiscountActive, applyAnyDiscount, isCarNew, useAppWideDiscount } from '../constants/pricing';
import ImageGallery from './ImageGallery';

export default function CarTileCard({ car, onPress }) {
  const { colors } = useAppTheme();
  const { activeCurrency } = useCurrency();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const appWideDiscount = useAppWideDiscount();
  const hasActiveDiscount = isAnyDiscountActive(car.discount, appWideDiscount);
  const discountedPricePerDay = hasActiveDiscount ? applyAnyDiscount(car.pricePerDay, car.discount, appWideDiscount) : car.pricePerDay;

  return (
    <View style={styles.card}>
      <View style={styles.imageWrap}>
        <ImageGallery images={car.gallery} height={190} borderRadius={0} onPress={onPress} />
        {isCarNew(car.createdAt) && (
          <View style={styles.newBadge} pointerEvents="none">
            <Text style={styles.newBadgeText}>New</Text>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.info} onPress={onPress} activeOpacity={0.9}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{car.name}</Text>
          {car.type ? (
            <View style={styles.typeBadge}>
              <Text style={styles.typeText}>{car.type}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.locationRow}>
          <Text style={styles.location} numberOfLines={1}>📍 {car.location}</Text>
          {car.rating != null && (
            <View style={styles.ratingInline}>
              <Ionicons name="star" size={12} color="#F5A623" />
              <Text style={styles.ratingInlineText}>{car.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        {(car.drivenBy || car.transmission || car.seats) ? (
          <View style={styles.driveBadgeRow}>
            {car.drivenBy ? (
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
            ) : null}
            {car.transmission ? (
              <View style={styles.specItem}>
                <Ionicons name="settings-outline" size={11} color={colors.textMuted} />
                <Text style={styles.specText}>{car.transmission}</Text>
              </View>
            ) : null}
            {car.seats ? (
              <View style={styles.specItem}>
                <Ionicons name="people-outline" size={11} color={colors.textMuted} />
                <Text style={styles.specText}>{car.seats} seats</Text>
              </View>
            ) : null}
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
      </TouchableOpacity>
    </View>
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
    imageWrap: {
      position: 'relative',
    },
    newBadge: {
      position: 'absolute',
      top: 10,
      left: 10,
      backgroundColor: colors.orange,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    newBadgeText: {
      fontFamily: FONTS.bold,
      fontSize: 10,
      color: colors.white,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
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
      color: colors.textMuted,
    },
    driveBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      rowGap: 4,
      columnGap: 8,
      marginTop: 6,
    },
    specItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    specText: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.textMuted,
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
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    location: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textMuted,
      flexShrink: 1,
    },
    ratingInline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginLeft: 8,
    },
    ratingInlineText: {
      fontFamily: FONTS.semiBold,
      fontSize: 12,
      color: colors.textPrimary,
    },
    bottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
    },
    priceValueRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
      flexShrink: 1,
    },
    priceStrikethrough: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      textDecorationLine: 'line-through',
    },
    price: {
      fontFamily: FONTS.bold,
      fontSize: 20,
      color: colors.textPrimary,
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
