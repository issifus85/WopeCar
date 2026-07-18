import { StyleSheet, Text, View, TouchableOpacity, Image } from 'react-native';
import { COLORS, FONTS } from '../constants/theme';

export default function CarListCard({ car, onPress }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      {car.image ? (
        <Image source={{ uri: car.image }} style={styles.image} resizeMode="cover" />
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
        <View style={styles.detailsRow}>
          <Text style={styles.detail}>💺 {car.seats} seats</Text>
          <Text style={styles.detail}>⚙️ {car.transmission}</Text>
        </View>
        <View style={styles.bottomRow}>
          <View>
            <Text style={styles.price}>${car.pricePerDay}<Text style={styles.priceLabel}>/day</Text></Text>
          </View>
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
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  image: {
    width: 110,
    height: 130,
  },
  imagePlaceholder: {
    backgroundColor: '#EEF9F9',
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
    color: COLORS.navy,
    flexShrink: 1,
  },
  typeBadge: {
    backgroundColor: '#EEF9F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeText: {
    fontFamily: FONTS.semiBold,
    fontSize: 9,
    color: COLORS.teal,
  },
  location: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  detail: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#888',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  price: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    color: COLORS.teal,
  },
  priceLabel: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#999',
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
