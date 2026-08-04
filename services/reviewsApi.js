import supabase from './supabase';

const REVIEW_SELECT = `
  id, booking_id, car_id, vendor_id, renter_id,
  overall_rating, cleanliness_rating, accuracy_rating, communication_rating,
  value_rating, convenience_rating, content, created_at, updated_at,
  renter:renter_id ( full_name, avatar_url )
`;

// "First L." instead of a full name - reviews are public (readable by
// anyone, even signed-out), so this is the same privacy bar as any other
// public-review platform (Google, Amazon) rather than exposing a renter's
// full legal name to strangers.
function maskName(fullName) {
  const trimmed = (fullName || '').trim();
  if (!trimmed) return 'A WopeCar renter';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

function normalizeReview(row) {
  return {
    id: row.id,
    bookingId: row.booking_id,
    carId: row.car_id,
    overallRating: row.overall_rating,
    categoryRatings: {
      cleanliness: row.cleanliness_rating,
      accuracy: row.accuracy_rating,
      communication: row.communication_rating,
      value: row.value_rating,
      convenience: row.convenience_rating,
    },
    content: row.content ?? '',
    authorName: maskName(row.renter?.full_name),
    authorAvatar: row.renter?.avatar_url ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Published reviews for a car, most recent first - public data, readable by
 * anyone browsing (reviews_public_select RLS policy), no auth required.
 */
export async function getCarReviews(carId, { limit = 20 } = {}) {
  const { data, error } = await supabase
    .from('reviews')
    .select(REVIEW_SELECT)
    .eq('car_id', carId)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(normalizeReview);
}

/**
 * Aggregate score for a car, shaped to match components/ReviewsSection.js's
 * existing expected `reviewScore` prop exactly (score_total/total_review/
 * rate_score keyed '1'..'5') plus a new `categoryAverages` block the
 * component now also renders. Computed client-side from the same published
 * rows getCarReviews() would return - fine at this scale (a car's review
 * count), avoids needing a materialized view or RPC for what's a simple
 * aggregate.
 */
export async function getCarReviewScore(carId) {
  const { data, error } = await supabase
    .from('reviews')
    .select('overall_rating, cleanliness_rating, accuracy_rating, communication_rating, value_rating, convenience_rating')
    .eq('car_id', carId)
    .eq('is_published', true);
  if (error) throw error;

  const rows = data ?? [];
  const total = rows.length;

  const rateScore = {};
  const STAR_LABEL = { 5: 'Excellent', 4: 'Very Good', 3: 'Average', 2: 'Poor', 1: 'Terrible' };
  for (let star = 5; star >= 1; star -= 1) {
    const count = rows.filter((r) => r.overall_rating === star).length;
    rateScore[String(star)] = {
      title: STAR_LABEL[star],
      total: count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
    };
  }

  const scoreTotal = total > 0 ? rows.reduce((sum, r) => sum + r.overall_rating, 0) / total : 0;

  const categoryAverage = (key) => {
    const values = rows.map((r) => r[key]).filter((v) => v != null);
    if (values.length === 0) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  };

  return {
    total_review: total,
    score_total: scoreTotal,
    score_text: total === 0 ? 'Not rated yet' : null,
    rate_score: rateScore,
    categoryAverages: {
      cleanliness: categoryAverage('cleanliness_rating'),
      accuracy: categoryAverage('accuracy_rating'),
      communication: categoryAverage('communication_rating'),
      value: categoryAverage('value_rating'),
      convenience: categoryAverage('convenience_rating'),
    },
  };
}

/**
 * Completed bookings for this renter that don't have a review yet - powers
 * the "Rate your trip" prompt. A left join + filter-in-JS (rather than a
 * NOT IN subquery) since the renter's own booking list is already small.
 */
export async function getReviewableBookings(userId) {
  const [{ data: bookings, error: bookingsError }, { data: reviewed, error: reviewsError }] = await Promise.all([
    supabase.from('bookings').select('id, car_id, cars(name, images)').eq('renter_id', userId).eq('status', 'completed'),
    supabase.from('reviews').select('booking_id').eq('renter_id', userId),
  ]);
  if (bookingsError) throw bookingsError;
  if (reviewsError) throw reviewsError;

  const reviewedIds = new Set((reviewed ?? []).map((r) => r.booking_id));
  return (bookings ?? []).filter((b) => !reviewedIds.has(b.id));
}

/** Fetches this renter's own review for a booking, if one exists (for the edit path) - reviews_renter_select_own covers this regardless of published state. */
export async function getMyReviewForBooking(bookingId) {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Creates a review for a completed booking. RLS (reviews_renter_insert)
 * re-enforces the "this booking is mine and it's completed" rule server-
 * side - this function doesn't re-check it, same trust boundary as every
 * other insert in this codebase.
 */
export async function submitReview({ bookingId, carId, vendorId, ratings, content }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('reviews')
    .insert({
      booking_id: bookingId,
      car_id: carId,
      vendor_id: vendorId,
      renter_id: user.id,
      overall_rating: ratings.overall,
      cleanliness_rating: ratings.cleanliness ?? null,
      accuracy_rating: ratings.accuracy ?? null,
      communication_rating: ratings.communication ?? null,
      value_rating: ratings.value ?? null,
      convenience_rating: ratings.convenience ?? null,
      content: content?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Edits a review the renter already left - restrict_renter_review_update guards this to only rating/content columns. */
export async function updateMyReview(reviewId, { ratings, content }) {
  const { data, error } = await supabase
    .from('reviews')
    .update({
      overall_rating: ratings.overall,
      cleanliness_rating: ratings.cleanliness ?? null,
      accuracy_rating: ratings.accuracy ?? null,
      communication_rating: ratings.communication ?? null,
      value_rating: ratings.value ?? null,
      convenience_rating: ratings.convenience ?? null,
      content: content?.trim() || null,
    })
    .eq('id', reviewId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
