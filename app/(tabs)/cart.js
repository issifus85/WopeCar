import { StyleSheet, Text, View, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../constants/theme';
import { useCart } from '../../contexts/CartContext';
import { fetchCarById } from '../../services/carsApi';
import CarListCard from '../../components/CarListCard';

export default function CartScreen() {
  const router = useRouter();
  const { cartIds, removeFromCart } = useCart();
  const [cars, setCars] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!cartIds.length) {
        setCars([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      Promise.all(cartIds.map(id => fetchCarById(id).catch(() => null)))
        .then(results => setCars(results.filter(Boolean)))
        .finally(() => setIsLoading(false));
    }, [cartIds])
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
        <Text style={styles.title}>Your Cart</Text>
        <Text style={styles.subtitle}>Your cart is empty.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {cars.length} {cars.length === 1 ? 'Car' : 'Cars'} in Cart
        </Text>
      </View>
      <FlatList
        data={cars}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.cartItem}>
            <CarListCard car={item} onPress={() => router.push(`/car/${item.id}`)} />
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => removeFromCart(item.id)}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={22} color="#999" />
            </TouchableOpacity>
          </View>
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
  cartItem: {
    position: 'relative',
  },
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#ffffff',
    borderRadius: 11,
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
