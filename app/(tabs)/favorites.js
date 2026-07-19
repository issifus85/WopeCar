import { StyleSheet, Text, View, FlatList, ActivityIndicator } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, FONTS } from '../../constants/theme';
import { useFavorites } from '../../contexts/FavoritesContext';
import { fetchCarById } from '../../services/carsApi';
import CarListCard from '../../components/CarListCard';

export default function FavoritesScreen() {
  const router = useRouter();
  const { favoriteIds } = useFavorites();
  const [cars, setCars] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!favoriteIds.length) {
        setCars([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      Promise.all(favoriteIds.map(id => fetchCarById(id).catch(() => null)))
        .then(results => setCars(results.filter(Boolean)))
        .finally(() => setIsLoading(false));
    }, [favoriteIds])
  );

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={COLORS.teal} />
      </View>
    );
  }

  if (!cars.length) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.title}>Your Favorites</Text>
        <Text style={styles.subtitle}>You haven't saved any cars yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {cars.length} {cars.length === 1 ? 'Car' : 'Cars'} Saved
        </Text>
      </View>
      <FlatList
        data={cars}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <CarListCard car={item} onPress={() => router.push(`/car/${item.id}`)} />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
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
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontFamily: FONTS.bold,
    fontSize: 20,
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
    padding: 20,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.navy,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#666',
  },
});
