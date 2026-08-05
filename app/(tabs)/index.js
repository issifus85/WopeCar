import { StyleSheet, Text, View, TextInput, FlatList, TouchableOpacity, ScrollView, ActivityIndicator, Image, Animated } from 'react-native';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORIES } from '../../data/cars';
import { fetchCars } from '../../services/carsApi';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import DateRangeModal, { formatDateShort } from '../../components/DateRangeModal';
import SortModal, { SORT_OPTIONS } from '../../components/SortModal';
import CurrencyModal from '../../components/CurrencyModal';
import FilterModal from '../../components/FilterModal';
import CarListCard from '../../components/CarListCard';
import CarTileCard from '../../components/CarTileCard';

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currencies, activeCurrency, setCurrency } = useCurrency();
  const [isCurrencyModalVisible, setIsCurrencyModalVisible] = useState(false);
  const [cars, setCars] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [viewMode, setViewMode] = useState('tile');
  const [isDateModalVisible, setIsDateModalVisible] = useState(false);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchScale = useRef(new Animated.Value(1)).current;
  const [sortBy, setSortBy] = useState('recommended');
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
      params.type = selectedCategory;
    }
    // No list-level date-availability filter yet against Supabase (see
    // services/carsApi.js's fetchCars doc comment) - startDate/endDate stay
    // selected for display and for the checkout flow, just not sent here.
    // 'recommended' is real now (cars.is_recommended), so it's sent like
    // every other sort rather than treated as a no-op default.
    if (sortBy) {
      params.orderBy = sortBy;
    }
    if (drivenBy.length) {
      params.driveType = drivenBy;
    }
    if (priceRange) {
      const [min, max] = priceRange.split(';').map(Number);
      if (min) params.minPrice = min;
      if (max) params.maxPrice = max;
    }
    if (vehicleClass.length) {
      params.vehicleClass = vehicleClass;
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
        <Ionicons name="search" size={19} color={isSearchFocused ? colors.teal : colors.textSubtle} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by location, model or type..."
          placeholderTextColor={colors.textSubtle}
          value={searchText}
          onChangeText={setSearchText}
          onFocus={handleSearchFocus}
          onBlur={handleSearchBlur}
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.disabled} />
          </TouchableOpacity>
        )}
      </Animated.View>

      <View style={styles.dateRow}>
        <TouchableOpacity
          style={styles.datePill}
          onPress={() => setIsDateModalVisible(true)}
        >
          <Ionicons name="calendar-outline" size={18} color={colors.teal} />
          <Text style={styles.datePillText}>
            {startDate && endDate
              ? `${formatDateShort(startDate)} - ${formatDateShort(endDate)}`
              : 'Select dates to check availability'}
          </Text>
        </TouchableOpacity>
        {startDate && endDate && (
          <TouchableOpacity onPress={handleClearDates} style={styles.clearDateButton} hitSlop={10}>
            <Ionicons name="close-circle" size={20} color={colors.textSubtle} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.categoriesWrap}>
        <TouchableOpacity
          style={styles.filtersButton}
          onPress={() => setIsFilterModalVisible(true)}
        >
          <Ionicons name="options-outline" size={20} color={colors.textPrimary} />
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
          <ActivityIndicator size="large" color={colors.teal} />
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
                <Ionicons name="swap-vertical-outline" size={15} color={colors.textPrimary} />
                <Text style={styles.sortButtonText} numberOfLines={1}>{currentSortLabel}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.currencyButton}
                onPress={() => setIsCurrencyModalVisible(true)}
              >
                <Text style={styles.currencyButtonText} numberOfLines={1}>{activeCurrency.code}</Text>
              </TouchableOpacity>

              <View style={styles.viewToggle}>
                <TouchableOpacity
                  style={[styles.viewToggleButton, viewMode === 'list' && styles.viewToggleButtonActive]}
                  onPress={() => setViewMode('list')}
                >
                  <Ionicons
                    name="list"
                    size={18}
                    color={viewMode === 'list' ? colors.white : colors.textPrimary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.viewToggleButton, viewMode === 'tile' && styles.viewToggleButtonActive]}
                  onPress={() => setViewMode('tile')}
                >
                  <Ionicons
                    name="grid"
                    size={16}
                    color={viewMode === 'tile' ? colors.white : colors.textPrimary}
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

      <CurrencyModal
        visible={isCurrencyModalVisible}
        onClose={() => setIsCurrencyModalVisible(false)}
        currencies={currencies}
        value={activeCurrency.code}
        onSelect={(code) => {
          setCurrency(code);
          setIsCurrencyModalVisible(false);
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

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      backgroundColor: colors.teal,
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
      backgroundColor: colors.surface,
      borderRadius: 16,
      marginHorizontal: 20,
      marginTop: -30,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderWidth: 1.5,
      borderColor: 'transparent',
      shadowColor: colors.shadow,
      shadowOpacity: 0.14,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    searchWrapperFocused: {
      borderColor: colors.teal,
    },
    searchInput: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 15,
      color: colors.textPrimary,
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
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    datePillText: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textPrimary,
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
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 16,
    },
    filtersBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      backgroundColor: colors.orange,
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
      color: colors.white,
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
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: 8,
    },
    categoryButtonActive: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    categoryText: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textMuted,
    },
    categoryTextActive: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
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
      color: colors.textPrimary,
    },
    sectionSubtitle: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.teal,
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
      backgroundColor: colors.divider,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    sortButtonText: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.textPrimary,
      flexShrink: 1,
    },
    currencyButton: {
      minWidth: 48,
      height: 34,
      paddingHorizontal: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.divider,
      borderRadius: 8,
    },
    currencyButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 12,
      color: colors.textPrimary,
    },
    viewToggle: {
      flexDirection: 'row',
      backgroundColor: colors.divider,
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
      backgroundColor: colors.teal,
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: 140,
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
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: 16,
    },
    retryButton: {
      backgroundColor: colors.teal,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 10,
    },
    retryButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 14,
    },
  });
}
