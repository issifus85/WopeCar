import { StyleSheet, Text, View, FlatList, Image, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../constants/theme';
import { formatCurrency } from '../../constants/pricing';
import { useBookings } from '../../contexts/BookingsContext';

const STATUS_COLORS = {
  Pending: { bg: '#FFF3E0', text: '#E65100' },
  Confirmed: { bg: '#E8F5E9', text: '#2E7D32' },
  Cancelled: { bg: '#FFEBEE', text: '#C62828' },
};

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function BookingCard({ booking, onPress }) {
  const statusStyle = STATUS_COLORS[booking.status] ?? STATUS_COLORS.Pending;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      {booking.carImage ? (
        <Image source={{ uri: booking.carImage }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Text style={styles.imagePlaceholderText}>🚗</Text>
        </View>
      )}
      <View style={styles.info}>
        <View style={styles.topRow}>
          <Text style={styles.carName} numberOfLines={1}>{booking.carName}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>{booking.status}</Text>
          </View>
        </View>
        <Text style={styles.dateRange}>
          {formatDate(booking.startDate)} — {formatDate(booking.endDate)}
        </Text>
        <Text style={styles.location} numberOfLines={1}>📍 {booking.pickupLocation}</Text>
        <Text style={styles.total}>{formatCurrency(booking.totalCost)}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function BookingsScreen() {
  const router = useRouter();
  const { bookings, isLoading } = useBookings();

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={COLORS.teal} />
      </View>
    );
  }

  if (!bookings.length) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="calendar-outline" size={40} color="#ccc" />
        <Text style={styles.title}>Your Bookings</Text>
        <Text style={styles.subtitle}>You have no bookings yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Bookings</Text>
      </View>
      <FlatList
        data={bookings}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <BookingCard booking={item} onPress={() => router.push(`/car/${item.carId}`)} />
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  image: {
    width: 100,
    height: 118,
  },
  imagePlaceholder: {
    backgroundColor: '#EEF9F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: {
    fontSize: 28,
  },
  info: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  carName: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.navy,
    flexShrink: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontFamily: FONTS.semiBold,
    fontSize: 10,
  },
  dateRange: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: '#666',
  },
  location: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#888',
  },
  total: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.teal,
    marginTop: 2,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 6,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.navy,
    marginTop: 4,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#666',
  },
});
