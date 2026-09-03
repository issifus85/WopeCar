import { useMemo } from 'react';
import { StyleSheet, View, FlatList, ActivityIndicator, Text, TouchableOpacity, RefreshControl, PixelRatio } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useVendor } from '../../contexts/VendorContext';
import VendorHeader from '../../components/VendorHeader';
import VendorCarCard from '../../components/VendorCarCard';
import { resizeImageUrl } from '../../utils/imageUrl';

// app/vendor/car/[id].js renders its own summary image at 72x72 - a
// different resizeImageUrl cache key than this list's 90x90 VendorCarCard,
// so it's warmed the instant a card is tapped.
const DETAIL_IMAGE_SIZE = 72;

export default function VendorFleetScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { cars, carEarningsThisMonth, isLoading, isRefreshing, refreshVendorData } = useVendor();

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <VendorHeader
        title="My Fleet"
        subtitle={`${cars.length} ${cars.length === 1 ? 'car' : 'cars'} listed`}
        onBack={() => router.replace('/vendor')}
        right={
          <TouchableOpacity style={styles.addButton} onPress={() => router.push('/vendor/add-car')} hitSlop={10}>
            <Ionicons name="add" size={22} color={colors.white} />
          </TouchableOpacity>
        }
      />

      {cars.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="car-outline" size={40} color={colors.disabled} />
          <Text style={styles.emptyText}>You haven't listed any cars yet.</Text>
          <TouchableOpacity style={styles.emptyAddButton} onPress={() => router.push('/vendor/add-car')}>
            <Text style={styles.emptyAddButtonText}>Add Your First Car</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={cars}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <VendorCarCard
              car={item}
              earningsThisMonth={carEarningsThisMonth[item.id] ?? 0}
              onPress={() => {
                if (item.image) {
                  Image.prefetch(
                    resizeImageUrl(item.image, { width: DETAIL_IMAGE_SIZE * PixelRatio.get(), height: DETAIL_IMAGE_SIZE * PixelRatio.get() }),
                    'memory-disk'
                  );
                }
                router.push(`/vendor/car/${item.id}`);
              }}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refreshVendorData} tintColor={colors.teal} colors={[colors.teal]} />}
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
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 20,
    },
    emptyText: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textSubtle,
      textAlign: 'center',
    },
    emptyAddButton: {
      marginTop: 12,
      backgroundColor: colors.teal,
      borderRadius: 12,
      paddingHorizontal: 20,
      paddingVertical: 13,
    },
    emptyAddButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 14,
    },
    list: {
      padding: 20,
    },
    addButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.teal,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
