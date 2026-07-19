import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Share, Platform, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { fetchCarById } from '../../services/carsApi';
import { COLORS, FONTS } from '../../constants/theme';
import { formatCurrency } from '../../constants/pricing';
import ImageGallery from '../../components/ImageGallery';
import SectionHeading from '../../components/SectionHeading';
import FeaturesSection from '../../components/FeaturesSection';
import FaqSection from '../../components/FaqSection';
import CarOwnerCard from '../../components/CarOwnerCard';
import ReviewsSection from '../../components/ReviewsSection';
import BookingChoiceModal from '../../components/BookingChoiceModal';
import { useFavorites } from '../../contexts/FavoritesContext';
import { useCart } from '../../contexts/CartContext';

const DESCRIPTION_TRUNCATE_LENGTH = 220;

export default function CarDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { addToCart } = useCart();
  const [car, setCar] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isBookingModalVisible, setIsBookingModalVisible] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    fetchCarById(id)
      .then(setCar)
      .catch(() => setError('Could not load this car. Please try again.'))
      .finally(() => setIsLoading(false));
  }, [id]);

  if (isLoading) {
    return (
      <View style={styles.notFound}>
        <ActivityIndicator size="large" color={COLORS.teal} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundText}>{error}</Text>
      </View>
    );
  }

  if (!car) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundText}>Car not found</Text>
      </View>
    );
  }

  const rating = car.reviewScore?.score_total ?? 0;
  const totalReviews = car.reviewScore?.total_review ?? 0;

  const specs = [
    { icon: 'people-outline', value: car.seats, label: 'Seats' },
    { icon: 'cog-outline', value: car.transmission, label: 'Transmission' },
    car.doors ? { icon: 'exit-outline', value: car.doors, label: 'Doors' } : null,
    car.baggage ? { icon: 'briefcase-outline', value: car.baggage, label: 'Baggage' } : null,
  ].filter(Boolean);

  const handleShare = async () => {
    const link = Linking.createURL(`/car/${car.id}`);
    const message = `Check out this ${car.name} on WopeCar - ${formatCurrency(car.pricePerDay)}/day in ${car.location}\n${link}`;

    try {
      // On native (iOS/Android) this opens the OS share sheet - Messages,
      // Mail, WhatsApp, social apps, AirDrop, Copy, etc. On web it delegates
      // to navigator.share() where supported (mobile Safari/Chrome).
      await Share.share({ title: car.name, message, url: link });
    } catch (err) {
      // Share.share() rejects when there's no share sheet available (e.g.
      // desktop browsers without the Web Share API) - copy the link instead
      // of failing silently.
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(link);
          Alert.alert('Link Copied', 'The link to this car has been copied to your clipboard.');
        } catch {
          Alert.alert('Share This Car', link);
        }
      }
    }
  };

  const handleInquiry = () => {
    setIsBookingModalVisible(false);
    router.push('/inbox');
  };

  const handleContinue = () => {
    addToCart(car.id);
    setIsBookingModalVisible(false);
    router.push('/cart');
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.galleryWrap}>
          <ImageGallery images={car.gallery} height={320} borderRadius={0} />

          <TouchableOpacity style={[styles.overlayButton, styles.backButton]} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={COLORS.navy} />
          </TouchableOpacity>

          <View style={styles.topRightButtons}>
            <TouchableOpacity
              style={styles.overlayButton}
              onPress={() => toggleFavorite(car.id)}
              hitSlop={8}
            >
              <Ionicons
                name={isFavorite(car.id) ? 'heart' : 'heart-outline'}
                size={20}
                color={isFavorite(car.id) ? COLORS.orange : COLORS.navy}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.overlayButton} onPress={handleShare} hitSlop={8}>
              <Ionicons name="share-social-outline" size={20} color={COLORS.navy} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sheet}>
          <Text style={styles.name}>{car.name}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="star" size={14} color="#F5A623" />
            <Text style={styles.metaText}>{rating.toFixed(1)} ({totalReviews} ratings)</Text>
            {!!car.location && (
              <>
                <Ionicons name="location-outline" size={14} color="#888" style={{ marginLeft: 10 }} />
                <Text style={styles.metaText}>{car.location}</Text>
              </>
            )}
          </View>

          <View style={styles.badgeRow}>
            {car.type ? (
              <View style={styles.typeBadge}>
                <Text style={styles.typeText}>{car.type}</Text>
              </View>
            ) : null}
            <View style={[
              styles.availabilityBadge,
              { backgroundColor: car.isAvailable ? '#E8F5E9' : '#FFEBEE' }
            ]}>
              <Text style={[
                styles.availabilityText,
                { color: car.isAvailable ? '#2E7D32' : '#C62828' }
              ]}>
                {car.isAvailable ? 'Available' : 'Unavailable'}
              </Text>
            </View>
            {car.drivenBy ? (
              <View style={[
                styles.driveBadge,
                car.drivenBy === 'Chauffeur' && styles.driveBadgeChauffeur,
              ]}>
                <Ionicons
                  name={car.drivenBy === 'Chauffeur' ? 'person' : 'key-outline'}
                  size={12}
                  color={car.drivenBy === 'Chauffeur' ? COLORS.orange : COLORS.mauve}
                />
                <Text style={[
                  styles.driveBadgeText,
                  car.drivenBy === 'Chauffeur' && styles.driveBadgeTextChauffeur,
                ]}>
                  {car.drivenBy === 'Chauffeur' ? 'Chauffeur Only' : 'Self-Drive'}
                </Text>
              </View>
            ) : null}
            <View style={styles.depositBadge}>
              <Ionicons name="cash-outline" size={12} color="#666" />
              <Text style={styles.depositBadgeText}>Security Deposit Required</Text>
            </View>
            <View style={styles.vettedBadge}>
              <Ionicons name="shield-checkmark" size={12} color="#ffffff" />
              <Text style={styles.vettedBadgeText}>Vetted by WopeCar</Text>
            </View>
          </View>

          <View style={styles.specsCard}>
            {specs.map((spec) => (
              <View key={spec.label} style={styles.specColumn}>
                <Ionicons name={spec.icon} size={20} color={COLORS.teal} />
                <Text style={styles.specValue}>{spec.value}</Text>
                <Text style={styles.specLabel}>{spec.label}</Text>
              </View>
            ))}
          </View>

          {!!car.description && (
            <View style={styles.section}>
              <SectionHeading>Description</SectionHeading>
              <Text style={styles.description}>
                {isDescriptionExpanded || car.description.length <= DESCRIPTION_TRUNCATE_LENGTH
                  ? car.description
                  : `${car.description.slice(0, DESCRIPTION_TRUNCATE_LENGTH).trimEnd()}…`}
              </Text>
              {car.description.length > DESCRIPTION_TRUNCATE_LENGTH && (
                <TouchableOpacity onPress={() => setIsDescriptionExpanded(v => !v)}>
                  <Text style={styles.readMoreText}>
                    {isDescriptionExpanded ? 'Read Less' : 'Read More'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {!!car.cancellationPolicy && (
            <View style={styles.section}>
              <SectionHeading>Cancellation Policy</SectionHeading>
              <View style={styles.cancellationRow}>
                <Ionicons name="calendar-outline" size={16} color={COLORS.teal} />
                <Text style={styles.cancellationText}>{car.cancellationPolicy}</Text>
              </View>
            </View>
          )}

          {!!car.features?.length && (
            <View style={styles.section}>
              <FeaturesSection features={car.features} />
            </View>
          )}

          {!!car.faqs?.length && (
            <View style={styles.section}>
              <FaqSection faqs={car.faqs} />
            </View>
          )}

          {!!car.owner && (
            <View style={styles.section}>
              <CarOwnerCard owner={car.owner} />
            </View>
          )}

          {!!car.reviewScore && (
            <View style={styles.section}>
              <ReviewsSection reviewScore={car.reviewScore} reviews={car.reviews} />
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <View>
          <Text style={styles.priceLabel}>Price per day</Text>
          <Text style={styles.price}>{formatCurrency(car.pricePerDay)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.bookButton, !car.isAvailable && styles.bookButtonDisabled]}
          onPress={() => setIsBookingModalVisible(true)}
          disabled={!car.isAvailable}
        >
          <Text style={styles.bookButtonText}>
            {car.isAvailable ? 'Book Now' : 'Unavailable'}
          </Text>
        </TouchableOpacity>
      </View>

      <BookingChoiceModal
        visible={isBookingModalVisible}
        onClose={() => setIsBookingModalVisible(false)}
        onInquiry={handleInquiry}
        onContinue={handleContinue}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  notFoundText: {
    fontFamily: FONTS.regular,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  galleryWrap: {
    position: 'relative',
  },
  overlayButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 16,
  },
  topRightButtons: {
    position: 'absolute',
    top: 50,
    right: 16,
    flexDirection: 'row',
    gap: 10,
  },
  sheet: {
    padding: 20,
  },
  name: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.navy,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  metaText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#888',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  typeBadge: {
    backgroundColor: '#EEF9F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  typeText: {
    fontFamily: FONTS.semiBold,
    fontSize: 12,
    color: COLORS.teal,
  },
  availabilityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  availabilityText: {
    fontFamily: FONTS.semiBold,
    fontSize: 12,
  },
  driveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F5EBE7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  driveBadgeChauffeur: {
    backgroundColor: '#FDECE3',
  },
  driveBadgeText: {
    fontFamily: FONTS.semiBold,
    fontSize: 12,
    color: COLORS.mauve,
  },
  driveBadgeTextChauffeur: {
    color: COLORS.orange,
  },
  depositBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  depositBadgeText: {
    fontFamily: FONTS.semiBold,
    fontSize: 12,
    color: '#666',
  },
  vettedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.teal,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  vettedBadgeText: {
    fontFamily: FONTS.semiBold,
    fontSize: 12,
    color: '#ffffff',
  },
  specsCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    borderRadius: 14,
    paddingVertical: 18,
    marginTop: 20,
  },
  specColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  specValue: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.navy,
  },
  specLabel: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#888',
  },
  section: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  description: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#444',
    lineHeight: 21,
  },
  readMoreText: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: COLORS.teal,
    marginTop: 6,
  },
  cancellationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancellationText: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.navy,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 28,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 6,
  },
  priceLabel: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#999',
  },
  price: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.teal,
  },
  bookButton: {
    backgroundColor: COLORS.teal,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
  },
  bookButtonDisabled: {
    backgroundColor: '#ccc',
  },
  bookButtonText: {
    fontFamily: FONTS.semiBold,
    color: '#ffffff',
    fontSize: 15,
  },
});
