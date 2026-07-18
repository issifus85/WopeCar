import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useState, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { fetchCarById } from '../../services/carsApi';
import { COLORS, FONTS } from '../../constants/theme';

export default function CarDetailScreen() {
  const { id } = useLocalSearchParams();
  const [car, setCar] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    fetchCarById(id)
      .then(setCar)
      .catch(() => setError('Could not load this car. Please try again.'))
      .finally(() => setIsLoading(false));
  }, [id]);

  if (isLoading) {
    return (
      <View style={styles.notFound}>
        <ActivityIndicator size="large" color={COLORS.teal} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundText}>{error}</Text>
      </View>
    );
  }

  if (!car) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundText}>Car not found</Text>
      </View>
    );
  }

  const photo = car.bannerImage || car.image;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.imagePlaceholderText}>🚗</Text>
        </View>
      )}

      <View style={styles.nameRow}>
        <Text style={styles.name}>{car.name}</Text>
        {car.type ? (
          <View style={styles.typeBadge}>
            <Text style={styles.typeText}>{car.type}</Text>
          </View>
        ) : null}
      </View>

      {!!car.location && <Text style={styles.location}>📍 {car.location}</Text>}

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

      {!!car.description && (
        <Text style={styles.description}>{car.description}</Text>
      )}

      <View style={styles.specsRow}>
        <View style={styles.specCard}>
          <Text style={styles.specValue}>💺 {car.seats}</Text>
          <Text style={styles.specLabel}>Seats</Text>
        </View>
        <View style={styles.specCard}>
          <Text style={styles.specValue}>⚙️ {car.transmission}</Text>
          <Text style={styles.specLabel}>Transmission</Text>
        </View>
      </View>

      {(car.doors || car.baggage) && (
        <View style={styles.specsRow}>
          {!!car.doors && (
            <View style={styles.specCard}>
              <Text style={styles.specValue}>🚪 {car.doors}</Text>
              <Text style={styles.specLabel}>Doors</Text>
            </View>
          )}
          {!!car.baggage && (
            <View style={styles.specCard}>
              <Text style={styles.specValue}>🧳 {car.baggage}</Text>
              <Text style={styles.specLabel}>Baggage</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.priceRow}>
        <View>
          <Text style={styles.price}>${car.pricePerDay}</Text>
          <Text style={styles.priceLabel}>per day</Text>
        </View>
        <TouchableOpacity
          style={[styles.bookButton, !car.isAvailable && styles.bookButtonDisabled]}
          disabled={!car.isAvailable}
        >
          <Text style={styles.bookButtonText}>
            {car.isAvailable ? 'Book Now' : 'Unavailable'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 20,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  notFoundText: {
    fontFamily: FONTS.regular,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  image: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    marginBottom: 20,
    backgroundColor: '#EEF9F9',
  },
  imagePlaceholder: {
    height: 180,
    borderRadius: 16,
    backgroundColor: '#EEF9F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  imagePlaceholderText: {
    fontSize: 56,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  name: {
    fontFamily: FONTS.bold,
    fontSize: 24,
    color: COLORS.navy,
  },
  typeBadge: {
    backgroundColor: '#EEF9F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeText: {
    fontFamily: FONTS.semiBold,
    fontSize: 12,
    color: COLORS.teal,
  },
  location: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  availabilityBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginTop: 12,
  },
  availabilityText: {
    fontFamily: FONTS.semiBold,
    fontSize: 12,
  },
  description: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#444',
    lineHeight: 21,
    marginTop: 16,
  },
  specsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  specCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  specValue: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.navy,
  },
  specLabel: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 32,
  },
  price: {
    fontFamily: FONTS.bold,
    fontSize: 28,
    color: COLORS.teal,
  },
  priceLabel: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#999',
  },
  bookButton: {
    backgroundColor: COLORS.teal,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
  },
  bookButtonDisabled: {
    backgroundColor: '#ccc',
  },
  bookButtonText: {
    fontFamily: FONTS.semiBold,
    color: '#ffffff',
    fontSize: 15,
  },
});
