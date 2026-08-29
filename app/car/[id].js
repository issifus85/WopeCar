import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Share, Platform, Alert } from 'react-native';
import { useState, useEffect, useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { fetchCarById, fetchCarAvailabilityByStatus } from '../../services/carsApi';
import { WEEKDAYS, MONTH_NAMES, stripTime, toISODate, buildMonthGrid } from '../../services/vendorCalendar';
import { getCarReviews, getCarReviewScore } from '../../services/reviewsApi';
import { getCarDetailFaqs } from '../../services/faqsApi';
import { getRentalTermsSections } from '../../services/rentalTermsApi';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { formatCurrency, getMinBookingDays, isAnyDiscountActive, applyAnyDiscount, useAppWideDiscount } from '../../constants/pricing';
import ImageGallery from '../../components/ImageGallery';
import SectionHeading from '../../components/SectionHeading';
import FeaturesSection from '../../components/FeaturesSection';
import FaqSection from '../../components/FaqSection';
import CarOwnerCard from '../../components/CarOwnerCard';
import ReviewsSection from '../../components/ReviewsSection';
import RentalTermsSection from '../../components/RentalTermsSection';
import BookingChoiceModal from '../../components/BookingChoiceModal';
import { useFavorites } from '../../contexts/FavoritesContext';
import { useCart } from '../../contexts/CartContext';
import { useInbox } from '../../contexts/InboxContext';
import { getAvailabilityBadge } from '../../utils/carAvailability';

const DESCRIPTION_TRUNCATE_LENGTH = 220;

export default function CarDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const { activeCurrency } = useCurrency();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isFavorite, toggleFavorite } = useFavorites();
  const { addToCart } = useCart();
  const { startInquiry } = useInbox();
  const [car, setCar] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isBookingModalVisible, setIsBookingModalVisible] = useState(false);
  const [reviewScore, setReviewScore] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [faqs, setFaqs] = useState([]);
  const [rentalTerms, setRentalTerms] = useState(null);
  const [unavailableDates, setUnavailableDates] = useState(new Set());
  const today = stripTime(new Date());
  const [availabilityViewMonth, setAvailabilityViewMonth] = useState(today);
  const appWideDiscount = useAppWideDiscount();

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    fetchCarById(id)
      .then(setCar)
      .catch(() => setError('Could not load this car. Please try again.'))
      .finally(() => setIsLoading(false));

    // Independent of the car fetch above/its loading state - reviews and
    // FAQs are secondary sections, no reason to hold up the rest of the
    // page for them.
    getCarReviewScore(id).then(setReviewScore).catch(() => setReviewScore(null));
    getCarReviews(id).then(setReviews).catch(() => setReviews([]));
    getCarDetailFaqs().then(setFaqs).catch(() => setFaqs([]));
    getRentalTermsSections().then(setRentalTerms).catch(() => setRentalTerms(null));

    // Same "nice to have, don't block the page" treatment as
    // app/checkout/dates.js's own availability fetch - a renter can still
    // browse and start checkout if this fails, the real date-conflict check
    // happens there (and, now, at the database level).
    fetchCarAvailabilityByStatus(id)
      .then(({ bookedDates, blockedDates }) => setUnavailableDates(new Set([...bookedDates, ...blockedDates])))
      .catch(() => setUnavailableDates(new Set()));
  }, [id]);

  if (isLoading) {
    return (
      <View style={styles.notFound}>
        <ActivityIndicator size="large" color={colors.teal} />
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

  const rating = reviewScore?.score_total ?? 0;
  const totalReviews = reviewScore?.total_review ?? 0;

  const canGoPrevAvailabilityMonth =
    availabilityViewMonth.getFullYear() > today.getFullYear() ||
    (availabilityViewMonth.getFullYear() === today.getFullYear() && availabilityViewMonth.getMonth() > today.getMonth());

  const hasActiveDiscount = isAnyDiscountActive(car.discount, appWideDiscount);
  const discountedPricePerDay = hasActiveDiscount ? applyAnyDiscount(car.pricePerDay, car.discount, appWideDiscount) : car.pricePerDay;
  const availability = getAvailabilityBadge(car);

  const specs = [
    { icon: 'people-outline', value: car.seats, label: 'Seats' },
    { icon: 'cog-outline', value: car.transmission, label: 'Transmission' },
    car.energySource ? { icon: 'flash-outline', value: car.energySource, label: 'Energy Source' } : null,
    car.doors ? { icon: 'exit-outline', value: car.doors, label: 'Doors' } : null,
    car.baggage ? { icon: 'briefcase-outline', value: car.baggage, label: 'Baggage' } : null,
  ].filter(Boolean);

  const handleShare = async () => {
    const link = Linking.createURL(`/car/${car.id}`);
    const message = `Check out this ${car.name} on WopeCar - ${formatCurrency(car.pricePerDay, activeCurrency)}/day in ${car.location}\n${link}`;

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

  // Hosts are never directly messageable (see InboxContext.js) - a
  // pre-booking inquiry has no booking yet to anchor a real conversation to,
  // so this opens a real, server-side conversation pinned to this car
  // instead (conversations.car_id, see startInquiry/InboxContext.js) rather
  // than a real booking - visible to WopeCar Support the same way a
  // booking-anchored conversation already is.
  const handleInquiry = async () => {
    setIsBookingModalVisible(false);
    try {
      const conversationId = await startInquiry(
        car.id,
        `Hi! I have a question about the ${car.name} (${car.location}).`
      );
      router.push({ pathname: `/inbox/${conversationId}`, params: { from: 'car', carId: car.id } });
    } catch (e) {
      Alert.alert('Could not start inquiry', e.message || 'Please check your connection and try again.');
    }
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
            <Ionicons name="chevron-back" size={22} color={colors.navy} />
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
                color={isFavorite(car.id) ? colors.orange : colors.navy}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.overlayButton} onPress={handleShare} hitSlop={8}>
              <Ionicons name="share-social-outline" size={20} color={colors.navy} />
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
                <Ionicons name="location-outline" size={14} color={colors.textSubtle} style={{ marginLeft: 10 }} />
                <Text style={styles.metaText}>{car.location}</Text>
              </>
            )}
            <Ionicons
              name={availability.isAvailable ? 'checkmark-circle' : 'close-circle'}
              size={14}
              color={availability.isAvailable ? colors.success : colors.error}
              style={{ marginLeft: 10 }}
            />
            <Text style={[styles.metaText, { color: availability.isAvailable ? colors.success : colors.error }]}>
              {availability.longLabel}
            </Text>
          </View>

          <View style={styles.badgeRow}>
            {car.type ? (
              <View style={styles.typeBadge}>
                <Text style={styles.typeText}>{car.type}</Text>
              </View>
            ) : null}
            {car.drivenBy ? (
              <View style={styles.minDaysBadge}>
                <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
                <Text style={styles.minDaysBadgeText}>
                  Min. {getMinBookingDays(car.drivenBy)} {getMinBookingDays(car.drivenBy) === 1 ? 'day' : 'days'}
                </Text>
              </View>
            ) : null}
            {car.drivenBy ? (
              <View style={[
                styles.driveBadge,
                car.drivenBy === 'Chauffeur' && styles.driveBadgeChauffeur,
              ]}>
                <Ionicons
                  name={car.drivenBy === 'Chauffeur' ? 'person' : 'key-outline'}
                  size={12}
                  color={car.drivenBy === 'Chauffeur' ? colors.orange : colors.mauve}
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
              <Ionicons name="cash-outline" size={12} color={colors.textMuted} />
              <Text style={styles.depositBadgeText}>Security Deposit Required</Text>
            </View>
            <View style={styles.vettedBadge}>
              <Ionicons name="shield-checkmark" size={12} color={colors.white} />
              <Text style={styles.vettedBadgeText}>Vetted by WopeCar</Text>
            </View>
          </View>

          <View style={styles.specsCard}>
            {specs.map((spec) => (
              <View key={spec.label} style={styles.specColumn}>
                <Ionicons name={spec.icon} size={20} color={colors.teal} />
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

          <View style={styles.section}>
            <SectionHeading>Availability</SectionHeading>
            <View style={styles.availabilityLegendRow}>
              <View style={styles.availabilityLegendItem}>
                <View style={[styles.availabilityLegendDot, { backgroundColor: colors.teal }]} />
                <Text style={styles.availabilityLegendText}>Available</Text>
              </View>
              <View style={styles.availabilityLegendItem}>
                <View style={[styles.availabilityLegendDot, { backgroundColor: '#FFCDD2' }]} />
                <Text style={styles.availabilityLegendText}>Unavailable</Text>
              </View>
            </View>

            <View style={styles.availabilityMonthNav}>
              <TouchableOpacity
                onPress={() => setAvailabilityViewMonth(new Date(availabilityViewMonth.getFullYear(), availabilityViewMonth.getMonth() - 1, 1))}
                disabled={!canGoPrevAvailabilityMonth}
                hitSlop={10}
              >
                <Ionicons name="chevron-back" size={20} color={canGoPrevAvailabilityMonth ? colors.textPrimary : colors.disabled} />
              </TouchableOpacity>
              <Text style={styles.availabilityMonthLabel}>
                {MONTH_NAMES[availabilityViewMonth.getMonth()]} {availabilityViewMonth.getFullYear()}
              </Text>
              <TouchableOpacity
                onPress={() => setAvailabilityViewMonth(new Date(availabilityViewMonth.getFullYear(), availabilityViewMonth.getMonth() + 1, 1))}
                hitSlop={10}
              >
                <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.availabilityWeekdayRow}>
              {WEEKDAYS.map((w) => <Text key={w} style={styles.availabilityWeekdayText}>{w}</Text>)}
            </View>

            <View style={styles.availabilityGrid}>
              {buildMonthGrid(availabilityViewMonth).map((day, index) => {
                if (!day) return <View key={`empty-${index}`} style={styles.availabilityDayCell} />;

                const isPast = day < today;
                const isUnavailable = unavailableDates.has(toISODate(day));
                const isSunday = day.getDay() === 0;

                return (
                  <View key={toISODate(day)} style={styles.availabilityDayCell}>
                    <View style={[
                      styles.availabilityDayCircle,
                      (isUnavailable || isSunday) && styles.availabilityDayCircleUnavailable,
                    ]}>
                      <Text style={[
                        styles.availabilityDayText,
                        (isPast || isSunday) && styles.availabilityDayTextPast,
                        isUnavailable && styles.availabilityDayTextUnavailable,
                      ]}>
                        {day.getDate()}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {!!rentalTerms && (
            <View style={styles.section}>
              <RentalTermsSection drivenBy={car.drivenBy} sections={rentalTerms} />
            </View>
          )}

          {!!car.cancellationPolicy && (
            <View style={styles.section}>
              <SectionHeading>Cancellation Policy</SectionHeading>
              <View style={styles.cancellationRow}>
                <Text style={styles.cancellationText}>{car.cancellationPolicy}</Text>
              </View>
            </View>
          )}

          {!!car.features?.length && (
            <View style={styles.section}>
              <FeaturesSection features={car.features} />
            </View>
          )}

          {!!faqs.length && (
            <View style={styles.section}>
              <FaqSection faqs={faqs} />
            </View>
          )}

          {!!car.owner && (
            <View style={styles.section}>
              <CarOwnerCard owner={car.owner} />
            </View>
          )}

          <View style={styles.section}>
            <ReviewsSection reviewScore={reviewScore} reviews={reviews} />
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <View>
          <Text style={styles.priceLabel}>Price per day</Text>
          <View style={styles.priceValueRow}>
            {hasActiveDiscount && (
              <Text style={styles.priceStrikethrough}>{formatCurrency(car.pricePerDay, activeCurrency)}</Text>
            )}
            <Text style={styles.price}>{formatCurrency(discountedPricePerDay, activeCurrency)}</Text>
          </View>
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

function createStyles(colors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
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
    color: colors.textMuted,
    textAlign: 'center',
  },
  galleryWrap: {
    position: 'relative',
  },
  // Floats over the photo gallery, not the app surface - stays a fixed
  // light chip regardless of theme so it reads against any photo.
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
    color: colors.textPrimary,
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
    color: colors.textSubtle,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  typeBadge: {
    backgroundColor: colors.highlight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  typeText: {
    fontFamily: FONTS.semiBold,
    fontSize: 12,
    color: colors.textMuted,
  },
  minDaysBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.divider,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  minDaysBadgeText: {
    fontFamily: FONTS.semiBold,
    fontSize: 12,
    color: colors.textMuted,
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
    color: colors.mauve,
  },
  driveBadgeTextChauffeur: {
    color: colors.orange,
  },
  depositBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.divider,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  depositBadgeText: {
    fontFamily: FONTS.semiBold,
    fontSize: 12,
    color: colors.textMuted,
  },
  vettedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.teal,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  vettedBadgeText: {
    fontFamily: FONTS.semiBold,
    fontSize: 12,
    color: colors.white,
  },
  specsCard: {
    flexDirection: 'row',
    backgroundColor: colors.background,
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
    color: colors.textPrimary,
  },
  specLabel: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: colors.textSubtle,
  },
  section: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  description: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: colors.textBody,
    lineHeight: 21,
  },
  readMoreText: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: colors.teal,
    marginTop: 6,
  },
  availabilityLegendRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
    marginBottom: 16,
  },
  availabilityLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  availabilityLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  availabilityLegendText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  availabilityMonthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  availabilityMonthLabel: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  availabilityWeekdayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  availabilityWeekdayText: {
    flex: 1,
    textAlign: 'center',
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: colors.textSubtle,
  },
  availabilityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  availabilityDayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  availabilityDayCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  availabilityDayCircleUnavailable: {
    backgroundColor: '#FFCDD2',
  },
  availabilityDayText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: colors.textPrimary,
  },
  availabilityDayTextPast: {
    color: colors.disabled,
  },
  availabilityDayTextUnavailable: {
    color: '#C62828',
  },
  cancellationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancellationText: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: colors.textPrimary,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 28,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 6,
  },
  priceLabel: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: colors.textSubtle,
  },
  priceValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  priceStrikethrough: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: colors.textSubtle,
    textDecorationLine: 'line-through',
  },
  price: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  bookButton: {
    backgroundColor: colors.teal,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
  },
  bookButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  bookButtonText: {
    fontFamily: FONTS.semiBold,
    color: colors.white,
    fontSize: 15,
  },
  });
}
