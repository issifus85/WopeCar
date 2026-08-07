import { useState, useMemo } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { formatCurrency } from '../../constants/pricing';
import { useBookings } from '../../contexts/BookingsContext';

const STATUS_TABS = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];

function getStatusColors(colors) {
  return {
    Pending: { bg: colors.warningBg, text: colors.warning },
    Confirmed: { bg: colors.successBg, text: colors.success },
    Completed: { bg: colors.successBg, text: colors.success },
    Cancelled: { bg: colors.errorBg, text: colors.error },
  };
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function BookingCard({ booking, onPress, styles, colors, currency }) {
  const statusColors = getStatusColors(colors);
  const statusStyle = statusColors[booking.status] ?? statusColors.Pending;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      {booking.carImage ? (
        <Image source={{ uri: booking.carImage }} style={styles.image} contentFit="cover" />
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
        <Text style={styles.total}>{formatCurrency(booking.totalCost, currency)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.disabled} style={styles.chevron} />
    </TouchableOpacity>
  );
}

export default function BookingsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { activeCurrency } = useCurrency();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { bookings, isLoading } = useBookings();
  const [activeTab, setActiveTab] = useState('Pending');

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  if (!bookings.length) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="calendar-outline" size={40} color={colors.disabled} />
        <Text style={styles.title}>Your Bookings</Text>
        <Text style={styles.subtitle}>You have no bookings yet.</Text>
      </View>
    );
  }

  const filtered = bookings.filter(b => b.status === activeTab);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Bookings</Text>
      </View>

      <View style={styles.tabRow}>
        {STATUS_TABS.map((tab) => {
          const count = bookings.filter(b => b.status === tab).length;
          const isActive = tab === activeTab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab}{count > 0 ? ` (${count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptyTab}>
          <Ionicons name="calendar-outline" size={32} color={colors.disabled} />
          <Text style={styles.emptyTabText}>No {activeTab.toLowerCase()} bookings.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <BookingCard booking={item} onPress={() => router.push(`/booking/${item.id}`)} styles={styles} colors={colors} currency={activeCurrency} />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
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
    tabRow: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      marginHorizontal: 16,
      borderRadius: 12,
      padding: 4,
      marginBottom: 16,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 9,
      alignItems: 'center',
    },
    tabActive: {
      backgroundColor: colors.teal,
    },
    tabText: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.textSubtle,
    },
    tabTextActive: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
    },
    emptyTab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingBottom: 80,
    },
    emptyTabText: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textSubtle,
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: 140,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      overflow: 'hidden',
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    image: {
      width: 100,
      height: 118,
    },
    imagePlaceholder: {
      backgroundColor: colors.highlight,
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
      color: colors.textPrimary,
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
      color: colors.textMuted,
    },
    location: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
    },
    total: {
      fontFamily: FONTS.bold,
      fontSize: 15,
      color: colors.textPrimary,
      marginTop: 2,
    },
    chevron: {
      marginRight: 10,
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
      color: colors.textPrimary,
      marginTop: 4,
    },
    subtitle: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textMuted,
    },
  });
}
