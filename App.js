import { StyleSheet, Text, View, TextInput, FlatList, TouchableOpacity } from 'react-native';
import { useState } from 'react';

const CARS = [
  {
    id: '1',
    name: 'Toyota RAV 4',
    location: 'Ashanti Region',
    pricePerDay: 145,
    seats: 5,
    transmission: 'Automatic',
    isAvailable: true,
  },
  {
    id: '2',
    name: 'Toyota Highlander',
    location: 'Ashanti Region',
    pricePerDay: 155,
    seats: 6,
    transmission: 'Automatic',
    isAvailable: true,
  },
  {
    id: '3',
    name: 'Hyundai Tucson',
    location: 'Greater Accra',
    pricePerDay: 100,
    seats: 5,
    transmission: 'Automatic',
    isAvailable: false,
  },
  {
    id: '4',
    name: 'Mitsubishi Outlander',
    location: 'Ashanti Region',
    pricePerDay: 145,
    seats: 7,
    transmission: 'Automatic',
    isAvailable: true,
  },
];

export default function App() {
  const [searchText, setSearchText] = useState('');

  const filteredCars = CARS.filter(car =>
    car.location.toLowerCase().includes(searchText.toLowerCase())
  );

  const renderCar = ({ item }) => (
    <TouchableOpacity style={styles.carCard}>
      <View style={styles.carInfo}>
        <Text style={styles.carName}>{item.name}</Text>
        <Text style={styles.carLocation}>📍 {item.location}</Text>
        <View style={styles.carDetails}>
          <Text style={styles.carDetail}>💺 {item.seats} seats</Text>
          <Text style={styles.carDetail}>⚙️ {item.transmission}</Text>
        </View>
      </View>
      <View style={styles.carRight}>
        <Text style={styles.carPrice}>${item.pricePerDay}</Text>
        <Text style={styles.carPriceLabel}>/day</Text>
        <View style={[
          styles.availabilityBadge,
          { backgroundColor: item.isAvailable ? '#E8F5E9' : '#FFEBEE' }
        ]}>
          <Text style={[
            styles.availabilityText,
            { color: item.isAvailable ? '#2E7D32' : '#C62828' }
          ]}>
            {item.isAvailable ? 'Available' : 'Unavailable'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>WopeCar 🚗</Text>
        <Text style={styles.tagline}>Rent a car in a few clicks</Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by location..."
          placeholderTextColor="#999"
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {filteredCars.length} Cars Available
        </Text>
      </View>

      <FlatList
        data={filteredCars}
        keyExtractor={item => item.id}
        renderItem={renderCar}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#3EB6BA',
    paddingTop: 60,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  logo: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  tagline: {
    fontSize: 14,
    color: '#ffffff',
    marginTop: 4,
  },
  searchContainer: {
    margin: 16,
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  carCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  carInfo: {
    flex: 1,
  },
  carName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  carLocation: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  carDetails: {
    flexDirection: 'row',
    gap: 10,
  },
  carDetail: {
    fontSize: 12,
    color: '#888',
  },
  carRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  carPrice: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#E8A020',
  },
  carPriceLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: -4,
  },
  availabilityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  availabilityText: {
    fontSize: 11,
    fontWeight: '600',
  },
});