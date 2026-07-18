import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { fetchCarById } from '../../api/cars';

export default function CarDetailScreen() {
  const { id } = useLocalSearchParams();
  const [car, setCar] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetchCarById(id)
      .then(setCar)
      .finally(() => setIsLoading(false));
  }, [id]);

  if (isLoading) {
    return (
      <View style={styles.notFound}>
        <ActivityIndicator size="large" color="#3EB6BA" />
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.imagePlaceholder}>
        <Text style={styles.imagePlaceholderText}>🚗</Text>
      </View>

      <View style={styles.nameRow}>
        <Text style={styles.name}>{car.name}</Text>
        <View style={styles.typeBadge}>
          <Text style={styles.typeText}>{car.type}</Text>
        </View>
      </View>

      <Text style={styles.location}>📍 {car.location}</Text>

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
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundText: {
    fontSize: 16,
    color: '#666',
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  typeBadge: {
    backgroundColor: '#EEF9F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 12,
    color: '#3EB6BA',
    fontWeight: '600',
  },
  location: {
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
    fontSize: 12,
    fontWeight: '600',
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
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  specLabel: {
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
    fontSize: 28,
    fontWeight: 'bold',
    color: '#3EB6BA',
  },
  priceLabel: {
    fontSize: 13,
    color: '#999',
  },
  bookButton: {
    backgroundColor: '#3EB6BA',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
  },
  bookButtonDisabled: {
    backgroundColor: '#ccc',
  },
  bookButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
