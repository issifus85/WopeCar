import { StyleSheet, Text, View, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCheckout } from '../../contexts/CheckoutContext';
import { fetchCarById } from '../../services/carsApi';
import CarListCard from '../../components/CarListCard';

export default function CartScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { cartIds, removeFromCart } = useCart();
  const { user } = useAuth();
  const { startCheckout } = useCheckout();
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

  const handleCheckout = (carId) => {
    if (!user) {
      router.push({ pathname: '/login', params: { redirect: '/checkout/dates', carId } });
      return;
    }
    startCheckout(carId);
    router.push({ pathname: '/checkout/dates', params: { carId } });
  };

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
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
              <Ionicons name="close-circle" size={22} color={colors.textSubtle} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.checkoutButton}
              onPress={() => handleCheckout(item.id)}
            >
              <Text style={styles.checkoutButtonText}>Checkout</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.white} />
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
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
      paddingTop: 60,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    headerTitle: {
      fontFamily: FONTS.bold,
      fontSize: 20,
      color: colors.textPrimary,
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: 20,
    },
    cartItem: {
      position: 'relative',
      marginBottom: 16,
    },
    removeButton: {
      position: 'absolute',
      top: 8,
      right: 8,
      backgroundColor: colors.surface,
      borderRadius: 11,
    },
    checkoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.teal,
      borderRadius: 10,
      paddingVertical: 12,
      marginTop: -4,
    },
    checkoutButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 14,
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
      color: colors.textPrimary,
      marginBottom: 8,
    },
    subtitle: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textMuted,
    },
  });
}
