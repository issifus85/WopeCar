import { StyleSheet, Text, View, TextInput, FlatList, TouchableOpacity, ScrollView, ActivityIndicator, Animated } from 'react-native';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { QUICK_FILTERS } from '../../data/cars';
import { fetchCars } from '../../services/carsApi';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useCart } from '../../contexts/CartContext';
import DateRangeModal, { formatDateShort } from '../../components/DateRangeModal';
import { toISODate } from '../../services/vendorCalendar';
import SortModal, { SORT_OPTIONS } from '../../components/SortModal';
import CurrencyModal from '../../components/CurrencyModal';
import FilterModal from '../../components/FilterModal';
import CarListCard from '../../components/CarListCard';
import CarTileCard from '../../components/CarTileCard';

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currencies, activeCurrency, setCurrency } = useCurrency();
  const { savedBookings } = useCart();
  // Reset only on remount, not persisted - dismissing hides the banner for
  // the rest of this app session without touching the underlying saved
  // booking, same "session, not the data" distinction the spec calls for.
  // Home stays mounted while switching tabs (React Navigation doesn't
  // unmount inactive tab screens), so this naturally survives tab
  // switches, just not a full app restart.
  const [isCartBannerDismissed, setIsCartBannerDismissed] = useState(false);
  const [isCurrencyModalVisible, setIsCurrencyModalVisible] = useState(false);
  const [cars, setCars] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');
  // Category moved from a single-select pill into the Filter modal (now a
  // multi-select checkbox section there, like Vehicle Class) - kept as an
  // array so the "SUVs/4x4" quick pill can toggle the exact same state the
  // modal's Category checkboxes write to.
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [seats, setSeats] = useState([]);
  const [locationFilters, setLocationFilters] = useState([]);
  const [viewMode, setViewMode] = useState('tile');
  const [isDateModalVisible, setIsDateModalVisible] = useState(false);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);
  const searchScale = useRef(new Animated.Value(1)).current;
  const [sortBy, setSortBy] = useState('recommended');
  const [isSortModalVisible, setIsSortModalVisible] = useState(false);
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [drivenBy, setDrivenBy] = useState([]);
  const [priceRange, setPriceRange] = useState(null);
  const [vehicleClass, setVehicleClass] = useState([]);

  const activeFilterCount =
    drivenBy.length + (priceRange ? 1 : 0) + vehicleClass.length + selectedTypes.length + seats.length + locationFilters.length;
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
  }, [selectedTypes, seats, locationFilters, startDate, endDate, sortBy, drivenBy, priceRange, vehicleClass]);

  const loadCars = () => {
    setIsLoading(true);
    setError(null);
    const params = {};
    if (selectedTypes.length) {
      params.type = selectedTypes;
    }
    if (seats.length) {
      params.seats = seats;
    }
    if (locationFilters.length) {
      params.location = locationFilters;
    }
    if (startDate && endDate) {
      params.startDate = toISODate(startDate);
      params.endDate = toISODate(endDate);
    }
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

  // Collapsed by default - the reference layout combines the date pill and
  // a search *toggle* into one compact row instead of always showing a full
  // text-input row underneath it (that was costing a whole extra row of
  // vertical space just to search, something most visits to Home don't need
  // since browsing/filtering by category covers the common case).
  const toggleSearch = () => {
    setIsSearchExpanded((prev) => {
      const next = !prev;
      if (next) {
        requestAnimationFrame(() => searchInputRef.current?.focus());
      } else {
        setSearchText('');
        searchInputRef.current?.blur();
      }
      return next;
    });
  };

  // Quick-filter pills span several different filter dimensions (see
  // data/cars.js's QUICK_FILTERS doc comment), so each pill's `key` decides
  // which state array it reads/toggles - "SUVs/4x4" and the Filter modal's
  // Category checkbox both end up toggling the same selectedTypes array.
  const toggleInArray = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const isQuickFilterActive = (filter) => {
    switch (filter.key) {
      case 'driveType': return drivenBy.includes(filter.value);
      case 'vehicleClass': return vehicleClass.includes(filter.value);
      case 'type': return selectedTypes.includes(filter.value);
      case 'seats': return seats.includes(filter.value);
      case 'location': return locationFilters.includes(filter.value);
      default: return false;
    }
  };

  const toggleQuickFilter = (filter) => {
    switch (filter.key) {
      case 'driveType': return setDrivenBy((prev) => toggleInArray(prev, filter.value));
      case 'vehicleClass': return setVehicleClass((prev) => toggleInArray(prev, filter.value));
      case 'type': return setSelectedTypes((prev) => toggleInArray(prev, filter.value));
      case 'seats': return setSeats((prev) => toggleInArray(prev, filter.value));
      case 'location': return setLocationFilters((prev) => toggleInArray(prev, filter.value));
      default: return undefined;
    }
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

  const nearestSavedBooking = savedBookings.length
    ? [...savedBookings].sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt))[0]
    : null;
  const showCartBanner = !!nearestSavedBooking && !isCartBannerDismissed;
  const cartBannerHoursLeft = nearestSavedBooking
    ? Math.max(0, Math.round((new Date(nearestSavedBooking.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60)))
    : 0;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]} />

      <View style={styles.combinedBar}>
        <TouchableOpacity
          style={styles.dateSegment}
          onPress={() => setIsDateModalVisible(true)}
        >
          <Ionicons name="calendar-outline" size={18} color={colors.teal} />
          <Text style={styles.datePillText} numberOfLines={1}>
            {startDate && endDate
              ? `${formatDateShort(startDate)} - ${formatDateShort(endDate)}`
              : 'Select dates to check availability'}
          </Text>
        </TouchableOpacity>
        {startDate && endDate && (
          <TouchableOpacity onPress={handleClearDates} style={styles.clearDateButton} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={colors.textSubtle} />
          </TouchableOpacity>
        )}
        <View style={styles.combinedDivider} />
        <TouchableOpacity
          style={[styles.searchToggle, isSearchExpanded && styles.searchToggleActive]}
          onPress={toggleSearch}
        >
          <Ionicons
            name={isSearchExpanded ? 'close' : 'search'}
            size={18}
            color={isSearchExpanded ? colors.white : colors.textPrimary}
          />
        </TouchableOpacity>
      </View>

      {showCartBanner && (
        <View style={styles.cartBanner}>
          <View style={styles.cartBannerTopRow}>
            <Ionicons name="cart-outline" size={18} color={colors.teal} />
            <Text style={styles.cartBannerTitle} numberOfLines={1}>
              You have a saved booking — {nearestSavedBooking.carName}
            </Text>
            <TouchableOpacity onPress={() => setIsCartBannerDismissed(true)} hitSlop={8}>
              <Ionicons name="close" size={16} color={colors.textSubtle} />
            </TouchableOpacity>
          </View>
          <View style={styles.cartBannerBottomRow}>
            <Text style={styles.cartBannerSubtitle}>
              Expires in {cartBannerHoursLeft} {cartBannerHoursLeft === 1 ? 'hour' : 'hours'}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/cart')} style={styles.cartBannerAction}>
              <Text style={styles.cartBannerActionText}>Complete Payment</Text>
              <Ionicons name="arrow-forward" size={13} color={colors.teal} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {isSearchExpanded && (
        <Animated.View
          style={[styles.searchWrapper, { transform: [{ scale: searchScale }] }]}
        >
          <Ionicons name="search" size={18} color={isSearchFocused ? colors.teal : colors.textSubtle} />
          <TextInput
            ref={searchInputRef}
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
      )}

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
          {QUICK_FILTERS.map((filter) => {
            const isActive = isQuickFilterActive(filter);
            return (
              <TouchableOpacity
                key={`${filter.key}-${filter.value}`}
                style={[styles.categoryButton, isActive && styles.categoryButtonActive]}
                onPress={() => toggleQuickFilter(filter)}
              >
                <Text style={[styles.categoryText, isActive && styles.categoryTextActive]}>
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
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
                {total} {total === 1 ? 'Car' : 'Cars'} Available
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

              <TouchableOpacity
                style={styles.viewToggle}
                onPress={() => setViewMode(viewMode === 'tile' ? 'list' : 'tile')}
              >
                <Ionicons
                  name={viewMode === 'tile' ? 'list' : 'grid'}
                  size={17}
                  color={colors.textPrimary}
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
            // On a cold cache, an unthrottled first batch fires one network
            // request per card (each card's ImageGallery has its own too) -
            // dozens of simultaneous multi-hundred-KB fetches all competing
            // for bandwidth is what read as "lag" on first launch. Rendering
            // fewer cards up front, then a couple more per scroll tick, caps
            // how many image requests start at once without changing what's
            // visible in the initial viewport.
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            windowSize={5}
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
        type={selectedTypes}
        onApply={({ drivenBy, priceRange, vehicleClass, type }) => {
          setDrivenBy(drivenBy);
          setPriceRange(priceRange);
          setVehicleClass(vehicleClass);
          setSelectedTypes(type);
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
      // paddingTop is set inline from useSafeAreaInsets() - a fixed value
      // here can't account for how much a device's notch/Dynamic
      // Island/punch-hole camera actually eats into the top of the screen,
      // which is exactly what let the combined search/date bar ride up
      // into the camera cutout on some phones.
      backgroundColor: colors.teal,
      paddingBottom: 12,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    cartBanner: {
      backgroundColor: colors.highlight,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.teal,
      marginHorizontal: 20,
      marginTop: 12,
      padding: 12,
    },
    cartBannerTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cartBannerBottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    cartBannerTitle: {
      flex: 1,
      fontFamily: FONTS.semiBold,
      fontSize: 12.5,
      color: colors.textPrimary,
    },
    cartBannerSubtitle: {
      fontFamily: FONTS.regular,
      fontSize: 11.5,
      color: colors.textSubtle,
    },
    cartBannerAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    cartBannerActionText: {
      fontFamily: FONTS.semiBold,
      fontSize: 12,
      color: colors.teal,
    },
    combinedBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 14,
      marginHorizontal: 20,
      marginTop: -22,
      paddingHorizontal: 8,
      paddingVertical: 4,
      shadowColor: colors.shadow,
      shadowOpacity: 0.14,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    dateSegment: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    datePillText: {
      flexShrink: 1,
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textPrimary,
    },
    clearDateButton: {
      padding: 2,
    },
    combinedDivider: {
      width: 1,
      height: 20,
      backgroundColor: colors.divider,
      marginHorizontal: 4,
    },
    searchToggle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.highlight,
    },
    searchToggleActive: {
      backgroundColor: colors.teal,
    },
    searchWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: 10,
      marginHorizontal: 20,
      marginTop: 8,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    searchInput: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textPrimary,
      outlineStyle: 'none',
    },
    categoriesWrap: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    filtersButton: {
      width: 34,
      height: 34,
      borderRadius: 9,
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
      height: 44,
      flex: 1,
    },
    categoriesContent: {
      paddingHorizontal: 16,
      paddingVertical: 4,
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
      marginBottom: 6,
      marginTop: 2,
    },
    sectionTitle: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textPrimary,
    },
    sectionSubtitle: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textMuted,
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
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.divider,
      borderRadius: 8,
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
