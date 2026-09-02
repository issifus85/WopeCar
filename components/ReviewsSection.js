import { useMemo } from 'react';
import { StyleSheet, Text, View, PixelRatio } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import SectionHeading from './SectionHeading';
import { resizeImageUrl, CAR_PHOTO_BLURHASH } from '../utils/imageUrl';

const STAR_COLOR = '#F5A623';
const AVATAR_SIZE = 32;

// Standard 5-to-1-star labels (matches Laravel/Bravo's own rate_score
// wording) - shown as a fixed set of rows, even before any reviews exist,
// so the breakdown reads as "0 reviews so far in each category" rather
// than disappearing entirely for an unrated car.
const STAR_LABELS = [
  { key: '5', title: 'Excellent' },
  { key: '4', title: 'Very Good' },
  { key: '3', title: 'Average' },
  { key: '2', title: 'Poor' },
  { key: '1', title: 'Terrible' },
];

// Matches app/review/[bookingId].js's CATEGORIES exactly - keep both lists
// in sync if the category set ever changes.
const CATEGORY_LABELS = [
  { key: 'cleanliness', title: 'Cleanliness' },
  { key: 'accuracy', title: 'Accuracy' },
  { key: 'communication', title: 'Communication' },
  { key: 'value', title: 'Value' },
  { key: 'convenience', title: 'Pickup/Return' },
];

function formatReviewDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export default function ReviewsSection({ reviewScore, reviews }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const total = reviewScore?.total_review ?? 0;
  const score = reviewScore?.score_total ?? 0;
  const scoreText = reviewScore?.score_text ?? 'Not rated yet';
  const rateScore = reviewScore?.rate_score ?? {};
  const categoryAverages = reviewScore?.categoryAverages ?? {};

  return (
    <View>
      <SectionHeading>Reviews & Ratings</SectionHeading>

      <View style={styles.summaryRow}>
        <View style={styles.scoreBlock}>
          <Text style={styles.scoreValue}>{score.toFixed(1)}</Text>
          <Text style={styles.scoreMax}>/5</Text>
        </View>
        <View>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Ionicons
                key={i}
                name={i <= Math.round(score) ? 'star' : 'star-outline'}
                size={14}
                color={STAR_COLOR}
              />
            ))}
          </View>
          <Text style={styles.summaryText}>
            {total > 0 ? `Based on ${total} ${total === 1 ? 'review' : 'reviews'}` : scoreText}
          </Text>
        </View>
      </View>

      <View style={styles.breakdown}>
        {STAR_LABELS.map(({ key, title }) => {
          const entry = rateScore[key];
          const percent = entry?.percent ?? 0;
          const count = entry?.total ?? 0;
          return (
            <View key={key} style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>{entry?.title ?? title}</Text>
              <View style={styles.breakdownBarTrack}>
                <View style={[styles.breakdownBarFill, { width: `${percent}%` }]} />
              </View>
              <Text style={styles.breakdownCount}>{count}</Text>
            </View>
          );
        })}
      </View>

      {total > 0 && (
        <View style={styles.categoryGrid}>
          {CATEGORY_LABELS.map(({ key, title }) => {
            const avg = categoryAverages[key];
            return (
              <View key={key} style={styles.categoryItem}>
                <Text style={styles.categoryLabel}>{title}</Text>
                <View style={styles.categoryBarTrack}>
                  <View style={[styles.categoryBarFill, { width: `${((avg ?? 0) / 5) * 100}%` }]} />
                </View>
                <Text style={styles.categoryValue}>{avg != null ? avg.toFixed(1) : '—'}</Text>
              </View>
            );
          })}
        </View>
      )}

      {reviews?.length ? (
        <View style={styles.reviewList}>
          {reviews.map((review, index) => (
            <View key={review.id ?? index} style={styles.reviewItem}>
              <View style={styles.reviewHeader}>
                {review.authorAvatar ? (
                  <Image
                    source={{ uri: resizeImageUrl(review.authorAvatar, { width: AVATAR_SIZE * PixelRatio.get(), height: AVATAR_SIZE * PixelRatio.get() }) }}
                    style={styles.avatar}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
                    placeholder={CAR_PHOTO_BLURHASH}
                    placeholderContentFit="cover"
                  />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarFallbackText}>
                      {(review.authorName ?? review.customer?.name ?? review.author_name ?? '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.reviewHeaderText}>
                  <View style={styles.reviewAuthorRow}>
                    <Text style={styles.reviewAuthor}>
                      {review.authorName ?? review.customer?.name ?? review.author_name ?? 'Anonymous'}
                    </Text>
                    {!!review.bookingId && (
                      <View style={styles.verifiedBadge}>
                        <Ionicons name="checkmark-circle" size={11} color={colors.success} />
                        <Text style={styles.verifiedBadgeText}>Verified Renter</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.reviewMetaRow}>
                    {!!review.overallRating && (
                      <View style={styles.starRow}>
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Ionicons
                            key={i}
                            name={i <= review.overallRating ? 'star' : 'star-outline'}
                            size={11}
                            color={STAR_COLOR}
                          />
                        ))}
                      </View>
                    )}
                    {!!review.createdAt && <Text style={styles.reviewDate}>{formatReviewDate(review.createdAt)}</Text>}
                  </View>
                </View>
              </View>
              {!!review.content && <Text style={styles.reviewContent}>{review.content}</Text>}
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.noReviewsText}>No reviews yet.</Text>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    scoreBlock: {
      flexDirection: 'row',
      alignItems: 'flex-end',
    },
    scoreValue: {
      fontFamily: FONTS.bold,
      fontSize: 32,
      color: colors.textPrimary,
    },
    scoreMax: {
      fontFamily: FONTS.regular,
      fontSize: 15,
      color: colors.textSubtle,
      marginBottom: 4,
    },
    starRow: {
      flexDirection: 'row',
      gap: 2,
    },
    summaryText: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 4,
    },
    breakdown: {
      marginTop: 16,
      gap: 8,
    },
    breakdownRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    breakdownLabel: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textMuted,
      width: 70,
    },
    breakdownBarTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.divider,
      overflow: 'hidden',
    },
    breakdownBarFill: {
      height: '100%',
      backgroundColor: STAR_COLOR,
      borderRadius: 3,
    },
    breakdownCount: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.textSubtle,
      width: 18,
      textAlign: 'right',
    },
    categoryGrid: {
      marginTop: 20,
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      paddingTop: 16,
    },
    categoryItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    categoryLabel: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textMuted,
      width: 100,
    },
    categoryBarTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.divider,
      overflow: 'hidden',
    },
    categoryBarFill: {
      height: '100%',
      backgroundColor: colors.teal,
      borderRadius: 3,
    },
    categoryValue: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.textSubtle,
      width: 24,
      textAlign: 'right',
    },
    reviewList: {
      marginTop: 16,
      gap: 14,
    },
    reviewItem: {
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      paddingTop: 12,
    },
    reviewHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
    },
    avatarFallback: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarFallbackText: {
      fontFamily: FONTS.bold,
      fontSize: 13,
      color: colors.teal,
    },
    reviewHeaderText: {
      flex: 1,
    },
    reviewAuthorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
    },
    reviewAuthor: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
    },
    verifiedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    verifiedBadgeText: {
      fontFamily: FONTS.medium,
      fontSize: 10,
      color: colors.success,
    },
    reviewMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 3,
    },
    reviewDate: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
    },
    reviewContent: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 8,
      lineHeight: 19,
    },
    noReviewsText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      marginTop: 14,
    },
  });
}
