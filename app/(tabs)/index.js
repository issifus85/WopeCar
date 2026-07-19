import { StyleSheet, Text, View, TextInput, FlatList, TouchableOpacity, ScrollView, ActivityIndicator, Image, Animated } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORIES } from '../../data/cars';
import { fetchCars, formatDateParam } from '../../services/carsApi';
import { COLORS, FONTS } from '../../constants/theme';
import DateRangeModal, { formatDateShort } from '../../components/DateRangeModal';
import SortModal, { SORT_OPTIONS } from '../../components/SortModal';
import FilterModal from '../../components/FilterModal';
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
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchScale = useRef(new Animated.Value(1)).current;
  const [sortBy, setSortBy] = useState('special');
  const [isSortModalVisible, setIsSortModalVisible] = useState(false);
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [drivenBy, setDrivenBy] = useState([]);
  const [priceRange, setPriceRange] = useState(null);
  const [vehicleClass, setVehicleClass] = useState([]);

  const activeFilterCount = drivenBy.length + (priceRange ? 1 : 0) + vehicleClass.length;
  const currentSortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label ?? 'Sort';

  const handleSearchFocus = () => {
    setIsSearchFocused(true);
    Animated.spring(searchScale, { toValue: 1.02, friction: 7, useNativeDriver: true }).start();
  };

  const handleSearchBlur = () => {
    setIsSearchFocused(false);
    Animated.spring(searchScale, { toValue: 1, friction: 7, useNativeDriver: true }).start();
  };

  useEffect(() => {
    loadCars();
  }, [selectedCategory, startDate, endDate, sortBy, drivenBy, priceRange, vehicleClass]);

  const loadCars = () => {
    setIsLoading(true);
    setError(null);
    const params = {};
    if (selectedCategory && selectedCategory !== 'All') {
      params['attrs[9][]'] = selectedCategory;
    }
    if (startDate && endDate) {
      params.start = formatDateParam(startDate);
      params.end = formatDateParam(endDate);
    }
    if (sortBy && sortBy !== 'special') {
      params.orderby = sortBy;
    }
    if (drivenBy.length) {
      params['driven_by[]'] = drivenBy;
    }
    if (priceRange) {
      params.price_range = priceRange;
    }
    if (vehicleClass.length) {
      params['attrs[25][]'] = vehicleClass;
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

      <Animated.View
        style={[
          styles.searchWrapper,
          isSearchFocused && styles.searchWrapperFocused,
          { transform: [{ scale: searchScale }] },
        ]}
      >
        <Ionicons name="search" size={19} color={isSearchFocused ? COLORS.teal : '#999'} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by location, model or type..."
          placeholderTextColor="#999"
          value={searchText}
          onChangeText={setSearchText}
          onFocus={handleSearchFocus}
          onBlur={handleSearchBlur}
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color="#ccc" />
          </TouchableOpacity>
        )}
      </Animated.View>

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

      <View style={styles.categoriesWrap}>
        <TouchableOpacity
          style={styles.filtersButton}
          onPress={() => setIsFilterModalVisible(true)}
        >
          <Ionicons name="options-outline" size={20} color={COLORS.navy} />
          {activeFilterCount > 0 && (
            <View style={styles.filtersBadge}>
              <Text style={styles.filtersBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          removeClippedSubviews={false}
          style={styles.categoriesRow}
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
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={COLORS.teal} />
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => loadCars()}
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
            <View style={styles.controlsRow}>
              <TouchableOpacity
                style={styles.sortButton}
                onPress={() => setIsSortModalVisible(true)}
              >
                <Ionicons name="swap-vertical-outline" size={15} color={COLORS.navy} />
                <Text style={styles.sortButtonText} numberOfLines={1}>{currentSortLabel}</Text>
              </TouchableOpacity>

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

      <SortModal
        visible={isSortModalVisible}
        onClose={() => setIsSortModalVisible(false)}
        value={sortBy}
        onSelect={(value) => {
          setSortBy(value);
          setIsSortModalVisible(false);
        }}
      />

      <FilterModal
        visible={isFilterModalVisible}
        onClose={() => setIsFilterModalVisible(false)}
        drivenBy={drivenBy}
        priceRange={priceRange}
        vehicleClass={vehicleClass}
        onApply={({ drivenBy, priceRange, vehicleClass }) => {
          setDrivenBy(drivenBy);
          setPriceRange(priceRange);
          setVehicleClass(vehicleClass);
        }}
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
    paddingBottom: 44,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  logo: {
    width: 56,
    height: 64,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: -30,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  searchWrapperFocused: {
    borderColor: COLORS.teal,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: COLORS.navy,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 18,
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
  categoriesWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filtersButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16,
  },
  filtersBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: COLORS.orange,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filtersBadgeText: {
    fontFamily: FONTS.bold,
    fontSize: 9,
    color: '#ffffff',
  },
  categoriesRow: {
    height: 56,
    flex: 1,
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
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 110,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  sortButtonText: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.navy,
    flexShrink: 1,
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
