import { StyleSheet, Text, View, TextInput, FlatList, TouchableOpacity, ScrollView } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { CARS, CATEGORIES } from '../../data/cars';

export default function HomeScreen() {
  const router = useRouter();
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const filteredCars = CARS.filter(car => {
    const matchesSearch =
      car.location.toLowerCase().includes(searchText.toLowerCase()) ||
      car.name.toLowerCase().includes(searchText.toLowerCase()) ||
      car.type.toLowerCase().includes(searchText.toLowerCase());

    const matchesCategory =
      selectedCategory === 'All' || car.type === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const renderCar = ({ item }) => (
    <TouchableOpacity
      style={styles.carCard}
      onPress={() => router.push(`/car/${item.id}`)}
    >
      <View style={styles.carInfo}>
        <View style={styles.carNameRow}>
          <Text style={styles.carName}>{item.name}</Text>
          <View style={styles.typeBadge}>
            <Text style={styles.typeText}>{item.type}</Text>
          </View>
        </View>
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
          placeholder="Search by location, model or type..."
          placeholderTextColor="#999"
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ height: 75}}
        contentContainerStyle={styles.categoriesContent}
      >
        {CATEGORIES.map(category => (
          <TouchableOpacity
            key={category}
            style={[
              styles.categoryButton,
              selectedCategory === category && styles.categoryButtonActive
            ]}
            onPress={() => setSelectedCategory(category)}
          >
            <Text style={[
              styles.categoryText,
              selectedCategory === category && styles.categoryTextActive
            ]}>
              {category}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {filteredCars.length} {filteredCars.length === 1 ? 'Car' : 'Cars'} Found
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
    marginBottom: 8,
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
  categoriesContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  categoryButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 8,
  },
  categoryButtonActive: {
    backgroundColor: '#3EB6BA',
    borderColor: '#3EB6BA',
  },
  categoryText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  categoryTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 8,
    marginTop: 4,
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
  carNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  carName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  typeBadge: {
    backgroundColor: '#EEF9F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeText: {
    fontSize: 10,
    color: '#3EB6BA',
    fontWeight: '600',
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
    color: '#3EB6BA',
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
