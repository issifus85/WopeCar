import { StyleSheet, Text, View, TextInput, FlatList, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { CATEGORIES } from '../../data/cars';
import { fetchCars } from '../../api/cars';
import { COLORS, FONTS } from '../../constants/theme';

export default function HomeScreen() {
  const router = useRouter();
  const [cars, setCars] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    loadCars();
  }, []);

  const loadCars = () => {
    setIsLoading(true);
    setError(null);
    fetchCars()
      .then(setCars)
      .catch(() => setError('Could not load cars. Please try again.'))
      .finally(() => setIsLoading(false));
  };

  const filteredCars = cars.filter(car => {
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
        <Image
          source={require('../../assets/logo-lockup-white.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.headline}>Freedom to Go Places</Text>
        <Text style={styles.tagline}>
          Rent a car <Text style={styles.taglineHighlight}>in a few clicks</Text>
        </Text>
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

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={COLORS.teal} />
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadCars}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
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
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.teal,
    paddingTop: 60,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  logo: {
    width: 140,
    height: 38,
    marginBottom: 14,
  },
  headline: {
    fontFamily: FONTS.display,
    fontSize: 30,
    color: COLORS.white,
    marginBottom: 6,
  },
  tagline: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.white,
  },
  taglineHighlight: {
    fontFamily: FONTS.semiBold,
    color: COLORS.orange,
  },
  searchContainer: {
    margin: 16,
    marginBottom: 8,
  },
  searchInput: {
    fontFamily: FONTS.regular,
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
    backgroundColor: COLORS.teal,
    borderColor: COLORS.teal,
  },
  categoryText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: '#666',
  },
  categoryTextActive: {
    fontFamily: FONTS.semiBold,
    color: '#ffffff',
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 8,
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.navy,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: COLORS.teal,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryButtonText: {
    fontFamily: FONTS.semiBold,
    color: '#ffffff',
    fontSize: 14,
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
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.navy,
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
  carLocation: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  carDetails: {
    flexDirection: 'row',
    gap: 10,
  },
  carDetail: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#888',
  },
  carRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  carPrice: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.teal,
  },
  carPriceLabel: {
    fontFamily: FONTS.regular,
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
    fontFamily: FONTS.semiBold,
    fontSize: 11,
  },
});
