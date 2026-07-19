import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { COLORS, FONTS } from '../constants/theme';
import ImageGallery from './ImageGallery';

export default function CarTileCard({ car, onPress }) {
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
          {car.drivenBy ? (
            <View style={[
              styles.driveBadge,
              car.drivenBy === 'Chauffeur' && styles.driveBadgeChauffeur,
            ]}>
              <Text style={[
                styles.driveBadgeText,
                car.drivenBy === 'Chauffeur' && styles.driveBadgeTextChauffeur,
              ]}>
                {car.drivenBy === 'Chauffeur' ? 'Chauffeur Only' : 'Self-Drive'}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.location} numberOfLines={1}>📍 {car.location}</Text>
        <View style={styles.detailsRow}>
          <Text style={styles.detail}>💺 {car.seats} seats</Text>
          <Text style={styles.detail}>⚙️ {car.transmission}</Text>
        </View>
        <View style={styles.bottomRow}>
          <Text style={styles.price}>${car.pricePerDay}<Text style={styles.priceLabel}>/day</Text></Text>
          <View style={[
            styles.availabilityBadge,
            { backgroundColor: car.isAvailable ? '#E8F5E9' : '#FFEBEE' }
          ]}>
            <Text style={[
              styles.availabilityText,
              { color: car.isAvailable ? '#2E7D32' : '#C62828' }
            ]}>
              {car.isAvailable ? 'Available' : 'Unavailable'}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
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
    color: COLORS.navy,
    flexShrink: 1,
  },
  typeBadge: {
    backgroundColor: '#EEF9F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeText: {
    fontFamily: FONTS.semiBold,
    fontSize: 10,
    color: COLORS.teal,
  },
  driveBadge: {
    backgroundColor: '#F5EBE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  driveBadgeChauffeur: {
    backgroundColor: '#FDECE3',
  },
  driveBadgeText: {
    fontFamily: FONTS.semiBold,
    fontSize: 10,
    color: COLORS.mauve,
  },
  driveBadgeTextChauffeur: {
    color: COLORS.orange,
  },
  location: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  detail: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#888',
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
    color: COLORS.teal,
  },
  priceLabel: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#999',
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
