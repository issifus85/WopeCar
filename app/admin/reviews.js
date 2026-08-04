import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import FilterTabs from '../../components/admin/FilterTabs';
import BadgeStatus from '../../components/admin/BadgeStatus';
import ReasonModal from '../../components/admin/ReasonModal';
import { listReviews, hideReview, unhideReview, setReviewFeatured } from '../../services/adminReviewsApi';

const CATEGORY_LABELS = [
  { key: 'cleanliness_rating', title: 'Cleanliness' },
  { key: 'accuracy_rating', title: 'Accuracy' },
  { key: 'communication_rating', title: 'Communication' },
  { key: 'value_rating', title: 'Value' },
  { key: 'convenience_rating', title: 'Pickup/Return' },
];

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function StarRow({ rating, colors }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name={i <= rating ? 'star' : 'star-outline'} size={13} color="#F5A623" />
      ))}
    </View>
  );
}

function ReviewCard({ review, onHide, onUnhide, onToggleFeatured, styles, colors }) {
  const renter = review.renter;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(renter?.full_name || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.cardHeaderInfo}>
          <Text style={styles.renterName} numberOfLines={1}>{renter?.full_name || 'Unknown renter'}</Text>
          <Text style={styles.carVendor} numberOfLines={1}>
            {review.cars?.name || 'Unknown car'} · {review.vendors?.business_name || 'Unknown vendor'}
          </Text>
        </View>
        <BadgeStatus label={review.is_published ? 'Published' : 'Hidden'} tone={review.is_published ? 'success' : 'muted'} />
      </View>

      <View style={styles.ratingRow}>
        <StarRow rating={review.overall_rating} colors={colors} />
        <Text style={styles.dateText}>{formatDate(review.created_at)}</Text>
      </View>

      {!!review.content && <Text style={styles.content}>{review.content}</Text>}

      <View style={styles.categoryRow}>
        {CATEGORY_LABELS.map(({ key, title }) => (
          review[key] != null ? (
            <View key={key} style={styles.categoryChip}>
              <Text style={styles.categoryChipText}>{title} {review[key]}</Text>
            </View>
          ) : null
        ))}
      </View>

      {!review.is_published && !!review.hidden_reason && (
        <Text style={styles.hiddenReason}>Hidden reason: {review.hidden_reason}</Text>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.featureButton} onPress={() => onToggleFeatured(review)}>
          <Ionicons name={review.is_featured ? 'star' : 'star-outline'} size={16} color={colors.teal} />
          <Text style={styles.featureButtonText}>{review.is_featured ? 'Featured' : 'Feature'}</Text>
        </TouchableOpacity>
        {review.is_published ? (
          <TouchableOpacity style={styles.hideButton} onPress={() => onHide(review)}>
            <Ionicons name="eye-off-outline" size={16} color={colors.error} />
            <Text style={styles.hideButtonText}>Hide</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.unhideButton} onPress={() => onUnhide(review)}>
            <Ionicons name="eye-outline" size={16} color={colors.white} />
            <Text style={styles.unhideButtonText}>Unhide</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function AdminReviewsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [tab, setTab] = useState('all');
  const [reviews, setReviews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [hideTarget, setHideTarget] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReviews(await listReviews(tab));
    } catch (e) {
      setError(e.message || 'Could not load reviews.');
    }
  }, [tab]);

  useEffect(() => {
    setIsLoading(true);
    load().finally(() => setIsLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  const handleHideConfirm = async (reason) => {
    setIsSaving(true);
    try {
      await hideReview(hideTarget, reason);
      setHideTarget(null);
      await load();
    } catch (e) {
      setError(e.message || 'Could not hide review.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnhide = async (review) => {
    try {
      await unhideReview(review);
      await load();
    } catch (e) {
      setError(e.message || 'Could not unhide review.');
    }
  };

  const handleToggleFeatured = async (review) => {
    try {
      await setReviewFeatured(review, !review.is_featured);
      await load();
    } catch (e) {
      setError(e.message || 'Could not update review.');
    }
  };

  return (
    <View style={styles.container}>
      <FilterTabs
        tabs={[{ key: 'all', label: 'All' }, { key: 'published', label: 'Published' }, { key: 'hidden', label: 'Hidden' }]}
        activeKey={tab}
        onChange={setTab}
      />

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.teal} style={styles.loading} />
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ReviewCard
              review={item}
              onHide={setHideTarget}
              onUnhide={handleUnhide}
              onToggleFeatured={handleToggleFeatured}
              styles={styles}
              colors={colors}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.teal} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No {tab === 'all' ? '' : tab} reviews.</Text>}
        />
      )}

      <ReasonModal
        visible={!!hideTarget}
        title="Hide Review"
        subtitle="This reason is sent to the reviewer."
        placeholder="Reason for hiding this review..."
        submitLabel={isSaving ? 'Hiding…' : 'Hide Review'}
        onCancel={() => setHideTarget(null)}
        onSubmit={handleHideConfirm}
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
    loading: {
      marginTop: 40,
    },
    errorText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.error,
      textAlign: 'center',
      marginTop: 8,
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    emptyText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      textAlign: 'center',
      marginTop: 40,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
      marginTop: 12,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.teal,
    },
    cardHeaderInfo: {
      flex: 1,
    },
    renterName: {
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    carVendor: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    dateText: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
    },
    content: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 19,
      marginBottom: 10,
    },
    categoryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 10,
    },
    categoryChip: {
      backgroundColor: colors.background,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    categoryChipText: {
      fontFamily: FONTS.medium,
      fontSize: 10,
      color: colors.textSubtle,
    },
    hiddenReason: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.error,
      marginBottom: 10,
      fontStyle: 'italic',
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    featureButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.teal,
    },
    featureButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 12,
      color: colors.teal,
    },
    hideButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.error,
    },
    hideButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 12,
      color: colors.error,
    },
    unhideButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.teal,
    },
    unhideButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 12,
      color: colors.white,
    },
  });
}
