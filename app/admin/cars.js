import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, RefreshControl, ActivityIndicator, Image } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { FONTS } from '../../constants/theme';
import { formatCurrency } from '../../constants/pricing';
import FilterTabs from '../../components/admin/FilterTabs';
import BadgeStatus from '../../components/admin/BadgeStatus';
import CarDetailModal from '../../components/admin/CarDetailModal';
import { listCars } from '../../services/adminCarsApi';

const STATUS_TONE = { pending: 'warning', active: 'success', inactive: 'muted' };

function CarCard({ car, onPress, styles, colors }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      {car.images?.[0] ? (
        <Image source={{ uri: car.images[0] }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]} />
      )}
      <View style={styles.cardInfo}>
        <View style={styles.cardTopRow}>
          <Text style={styles.carName} numberOfLines={1}>{car.name}</Text>
          <BadgeStatus label={car.status} tone={STATUS_TONE[car.status] || 'muted'} />
        </View>
        <Text style={styles.carSubtext} numberOfLines={1}>{car.type} · {car.vendors?.business_name || 'Unknown vendor'}</Text>
        <View style={styles.cardBottomRow}>
          <Text style={styles.carPrice}>{formatCurrency(car.price_per_day)}/day</Text>
          {!!car.regions?.name && <Text style={styles.carRegion}>{car.regions.name}</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function AdminCarsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [tab, setTab] = useState('pending');
  const [cars, setCars] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCar, setSelectedCar] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCars(await listCars({ status: tab }));
    } catch (e) {
      setError(e.message || 'Could not load cars.');
    }
  }, [tab]);

  useEffect(() => {
    setIsLoading(true);
    load().finally(() => setIsLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  return (
    <View style={styles.container}>
      <FilterTabs
        tabs={[
          { key: 'pending', label: 'Pending Approval' },
          { key: 'active', label: 'Active' },
          { key: 'inactive', label: 'Inactive' },
        ]}
        activeKey={tab}
        onChange={setTab}
      />

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.teal} style={styles.loading} />
      ) : (
        <FlatList
          data={cars}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CarCard car={item} onPress={() => setSelectedCar(item)} styles={styles} colors={colors} />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.teal} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No {tab} listings.</Text>}
        />
      )}

      <CarDetailModal
        visible={!!selectedCar}
        car={selectedCar}
        onClose={() => setSelectedCar(null)}
        onChanged={load}
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
    loading: {
      marginTop: 40,
    },
    errorText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.error,
      textAlign: 'center',
      marginTop: 8,
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    emptyText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      textAlign: 'center',
      marginTop: 40,
    },
    card: {
      flexDirection: 'row',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 10,
      marginBottom: 10,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    thumb: {
      width: 72,
      height: 72,
      borderRadius: 10,
    },
    thumbPlaceholder: {
      backgroundColor: colors.highlight,
    },
    cardInfo: {
      flex: 1,
      justifyContent: 'center',
      gap: 3,
    },
    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    carName: {
      flex: 1,
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    carSubtext: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
    },
    cardBottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    carPrice: {
      fontFamily: FONTS.semiBold,
      fontSize: 12,
      color: colors.textPrimary,
    },
    carRegion: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
    },
  });
}
