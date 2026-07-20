import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import SectionHeading from './SectionHeading';

const STAR_KEYS = ['5', '4', '3', '2', '1'];

export default function ReviewsSection({ reviewScore, reviews }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!reviewScore) return null;

  const total = reviewScore.total_review ?? 0;
  const score = reviewScore.score_total ?? 0;
  const scoreText = reviewScore.score_text ?? 'Not rated';
  const rateScore = reviewScore.rate_score ?? {};

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
                color="#F5A623"
              />
            ))}
          </View>
          <Text style={styles.summaryText}>
            {total > 0 ? `Based on ${total} ${total === 1 ? 'review' : 'reviews'}` : scoreText}
          </Text>
        </View>
      </View>

      {STAR_KEYS.some(key => rateScore[key]) && (
        <View style={styles.breakdown}>
          {STAR_KEYS.map((key) => {
            const entry = rateScore[key];
            if (!entry) return null;
            return (
              <View key={key} style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>{entry.title}</Text>
                <View style={styles.breakdownBarTrack}>
                  <View style={[styles.breakdownBarFill, { width: `${entry.percent}%` }]} />
                </View>
                <Text style={styles.breakdownCount}>{entry.total}</Text>
              </View>
            );
          })}
        </View>
      )}

      {reviews?.length ? (
        <View style={styles.reviewList}>
          {reviews.map((review, index) => (
            <View key={review.id ?? index} style={styles.reviewItem}>
              <Text style={styles.reviewAuthor}>
                {review.customer?.name ?? review.author_name ?? 'Anonymous'}
              </Text>
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
      backgroundColor: '#F5A623',
      borderRadius: 3,
    },
    breakdownCount: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.textSubtle,
      width: 18,
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
    reviewAuthor: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
    },
    reviewContent: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 4,
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
