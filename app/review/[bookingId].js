import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import supabase from '../../services/supabase';
import { getMyReviewForBooking, submitReview, updateMyReview } from '../../services/reviewsApi';
import StarRatingInput from '../../components/StarRatingInput';

const CATEGORIES = [
  { key: 'cleanliness', label: 'Vehicle Condition & Cleanliness' },
  { key: 'accuracy', label: 'Accuracy vs. Listing' },
  { key: 'communication', label: 'Vendor Communication' },
  { key: 'value', label: 'Value for Money' },
  { key: 'convenience', label: 'Pickup & Return Experience' },
];

// Reached from either app/booking/[id].js's "Rate Your Trip" button or the
// send-review-request email's deep link - both just need a bookingId.
export default function ReviewScreen() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [booking, setBooking] = useState(null);
  const [existingReviewId, setExistingReviewId] = useState(null);

  const [overall, setOverall] = useState(0);
  const [categoryRatings, setCategoryRatings] = useState({});
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from('bookings')
          .select('id, renter_id, car_id, vendor_id, status, cars(name, images)')
          .eq('id', bookingId)
          .single();
        if (error) throw error;
        if (cancelled) return;
        // RLS lets admin (and a vendor, for their own car's bookings) read
        // any booking, not just the renter's own - this app has no renter-
        // review-writing path for anyone but the actual renter, so catch
        // that here with a clear message rather than letting them fill out
        // the whole form and hit an opaque RLS rejection on submit.
        if (data.renter_id !== user?.id) {
          setLoadError("This booking isn't yours to review.");
          setIsLoading(false);
          return;
        }
        setBooking(data);

        const existing = await getMyReviewForBooking(bookingId);
        if (cancelled) return;
        if (existing) {
          setExistingReviewId(existing.id);
          setOverall(existing.overall_rating);
          setCategoryRatings({
            cleanliness: existing.cleanliness_rating,
            accuracy: existing.accuracy_rating,
            communication: existing.communication_rating,
            value: existing.value_rating,
            convenience: existing.convenience_rating,
          });
          setContent(existing.content ?? '');
        }
      } catch (e) {
        if (!cancelled) setLoadError(e.message || 'Could not load this booking.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [bookingId]);

  // Tapping the overall stars pre-fills every still-unset category to the
  // same value - most reviewers feel about every aspect the way they feel
  // overall, so this turns a 6-rating form into effectively a 1-tap form for
  // anyone happy to leave it there, while still letting them adjust any
  // category that genuinely differed.
  const handleOverallChange = (value) => {
    setOverall(value);
    setCategoryRatings((prev) => {
      const next = { ...prev };
      CATEGORIES.forEach(({ key }) => {
        if (!next[key]) next[key] = value;
      });
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!overall) {
      setSubmitError('Please give an overall rating.');
      return;
    }
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const ratings = { overall, ...categoryRatings };
      if (existingReviewId) {
        await updateMyReview(existingReviewId, { ratings, content });
      } else {
        await submitReview({ bookingId, carId: booking.car_id, vendorId: booking.vendor_id, ratings, content });
      }
      Alert.alert(
        existingReviewId ? 'Review Updated' : 'Thanks for your review!',
        existingReviewId ? 'Your changes have been saved.' : 'Your review helps other renters choose with confidence.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e) {
      setSubmitError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  if (loadError || !booking) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.errorText}>{loadError || 'Booking not found.'}</Text>
      </View>
    );
  }

  if (booking.status !== 'completed') {
    return (
      <View style={styles.centerState}>
        <Text style={styles.errorText}>This trip isn't marked completed yet, so it can't be reviewed.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.carRow}>
        {!!booking.cars?.images?.[0] && (
          <Image source={{ uri: booking.cars.images[0] }} style={styles.carImage} contentFit="cover" />
        )}
        <Text style={styles.carName}>{booking.cars?.name ?? 'Your trip'}</Text>
      </View>

      <Text style={styles.sectionLabel}>Overall Rating</Text>
      <View style={styles.overallCard}>
        <StarRatingInput value={overall} onChange={handleOverallChange} size={36} />
      </View>

      <Text style={styles.sectionLabel}>Rate Your Experience</Text>
      <View style={styles.categoryCard}>
        {CATEGORIES.map(({ key, label }) => (
          <StarRatingInput
            key={key}
            label={label}
            value={categoryRatings[key]}
            onChange={(value) => setCategoryRatings((prev) => ({ ...prev, [key]: value }))}
          />
        ))}
      </View>

      <Text style={styles.sectionLabel}>Tell us more (optional)</Text>
      <TextInput
        style={styles.textArea}
        placeholder="What stood out about the car, the vendor, or your trip?"
        placeholderTextColor={colors.textSubtle}
        value={content}
        onChangeText={setContent}
        multiline
        numberOfLines={5}
      />

      {!!submitError && <Text style={styles.errorText}>{submitError}</Text>}

      <TouchableOpacity
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.submitButtonText}>{existingReviewId ? 'Update Review' : 'Submit Review'}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
    },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    content: {
      padding: 20,
      paddingBottom: 40,
    },
    carRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 20,
    },
    carImage: {
      width: 56,
      height: 56,
      borderRadius: 12,
    },
    carName: {
      fontFamily: FONTS.bold,
      fontSize: 17,
      color: colors.textPrimary,
      flexShrink: 1,
    },
    sectionLabel: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
      marginBottom: 8,
      marginTop: 4,
    },
    overallCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: 20,
    },
    categoryCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingHorizontal: 14,
      marginBottom: 20,
    },
    textArea: {
      fontFamily: FONTS.regular,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      fontSize: 14,
      color: colors.textPrimary,
      minHeight: 110,
      textAlignVertical: 'top',
      marginBottom: 16,
    },
    errorText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.error,
      marginBottom: 16,
      textAlign: 'center',
    },
    submitButton: {
      backgroundColor: colors.teal,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
    },
    submitButtonDisabled: {
      opacity: 0.7,
    },
    submitButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 16,
    },
  });
}
