import { StyleSheet, Text, View, TextInput, FlatList, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORIES } from '../../data/cars';
import { fetchCars, formatDateParam } from '../../services/carsApi';
import { COLORS, FONTS } from '../../constants/theme';
import DateRangeModal, { formatDateShort } from '../../components/DateRangeModal';
import CarListCard from '../../components/CarListCard';
import CarTileCard from '../../components/CarTileCard';

export default function HomeScreen() {
  const router = useRouter();
  const [cars, setCars] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [viewMode, setViewMode] = useState('list');
  const [isDateModalVisible, setIsDateModalVisible] = useState(false);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  useEffect(() => {
    loadCars(selectedCategory, startDate, endDate);
  }, [selectedCategory, startDate, endDate]);

  const loadCars = (category, start, end) => {
    setIsLoading(true);
    setError(null);
    const params = {};
    if (category && category !== 'All') {
      params['attrs[9][]'] = category;
    }
    if (start && end) {
      params.start = formatDateParam(start);
      params.end = formatDateParam(end);
    }
    fetchCars(params)
      .then(({ cars, meta }) => {
        setCars(cars);
        setTotal(meta?.total ?? cars.length);
      })
      .catch(() => setError('Could not load cars. Please try again.'))
      .finally(() => setIsLoading(false));
  };

  const handleApplyDates = (start, end) => {
    setStartDate(start);
    setEndDate(end);
  };

  const handleClearDates = () => {
    setStartDate(null);
    setEndDate(null);
  };

  const filteredCars = cars.filter(car => {
    const matchesSearch =
      car.location.toLowerCase().includes(searchText.toLowerCase()) ||
      car.name.toLowerCase().includes(searchText.toLowerCase()) ||
      (car.type ?? '').toLowerCase().includes(searchText.toLowerCase());

    return matchesSearch;
  });

  const renderCar = ({ item }) => {
    const onPress = () => router.push(`/car/${item.id}`);
    return viewMode === 'list' ? (
      <CarListCard car={item} onPress={onPress} />
    ) : (
      <CarTileCard car={item} onPress={onPress} />
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Image
          source={require('../../assets/logo-mark-navy.png')}
          style={styles.logo}
          resizeMode="contain"
        />
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

      <View style={styles.dateRow}>
        <TouchableOpacity
          style={styles.datePill}
          onPress={() => setIsDateModalVisible(true)}
        >
          <Ionicons name="calendar-outline" size={18} color={COLORS.teal} />
          <Text style={styles.datePillText}>
            {startDate && endDate
              ? `${formatDateShort(startDate)} - ${formatDateShort(endDate)}`
              : 'Select dates to check availability'}
          </Text>
        </TouchableOpacity>
        {startDate && endDate && (
          <TouchableOpacity onPress={handleClearDates} style={styles.clearDateButton} hitSlop={10}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        removeClippedSubviews={false}
        style={{ height: 75}}
        contentContainerStyle={styles.categoriesContent}
      >
        {CATEGORIES.map(category => (
          <TouchableOpacity
            key={category.value}
            style={[
              styles.categoryButton,
              selectedCategory === category.value && styles.categoryButtonActive
            ]}
            onPress={() => setSelectedCategory(category.value)}
          >
            <Text style={[
              styles.categoryText,
              selectedCategory === category.value && styles.categoryTextActive
            ]}>
              {category.label}
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
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => loadCars(selectedCategory, startDate, endDate)}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <View>
              <Text style={styles.sectionTitle}>
                {total} {total === 1 ? 'Car' : 'Cars'} Found
              </Text>
              {startDate && endDate && (
                <Text style={styles.sectionSubtitle}>
                  Available {formatDateShort(startDate)} - {formatDateShort(endDate)}
                </Text>
              )}
            </View>
            <View style={styles.viewToggle}>
              <TouchableOpacity
                style={[styles.viewToggleButton, viewMode === 'list' && styles.viewToggleButtonActive]}
                onPress={() => setViewMode('list')}
              >
                <Ionicons
                  name="list"
                  size={18}
                  color={viewMode === 'list' ? '#ffffff' : COLORS.navy}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.viewToggleButton, viewMode === 'tile' && styles.viewToggleButtonActive]}
                onPress={() => setViewMode('tile')}
              >
                <Ionicons
                  name="grid"
                  size={16}
                  color={viewMode === 'tile' ? '#ffffff' : COLORS.navy}
                />
              </TouchableOpacity>
            </View>
          </View>

          <FlatList
            key={viewMode}
            data={filteredCars}
            keyExtractor={item => item.id}
            renderItem={renderCar}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

      <DateRangeModal
        visible={isDateModalVisible}
        onClose={() => setIsDateModalVisible(false)}
        startDate={startDate}
        endDate={endDate}
        onApply={handleApplyDates}
      />
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
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  logo: {
    width: 56,
    height: 64,
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
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 4,
    gap: 8,
  },
  datePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  datePillText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.navy,
  },
  clearDateButton: {
    padding: 2,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.navy,
  },
  sectionSubtitle: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.teal,
    marginTop: 2,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 3,
    gap: 2,
  },
  viewToggleButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
  },
  viewToggleButtonActive: {
    backgroundColor: COLORS.teal,
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
});
