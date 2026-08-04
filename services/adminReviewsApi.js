import supabase from './supabase';
import { notifyUser } from './adminNotify';

const REVIEW_SELECT = `
  id, renter_id, overall_rating, cleanliness_rating, accuracy_rating, communication_rating,
  value_rating, convenience_rating, content, is_published, is_featured,
  hidden_reason, created_at,
  renter:renter_id ( full_name, email ),
  cars ( name ),
  vendors ( business_name, user_id )
`;

/** 'all' | 'published' | 'hidden' - three tabs, mirrors listVendors/listBookings's own {tab} shape. */
export async function listReviews(tab) {
  let query = supabase.from('reviews').select(REVIEW_SELECT).order('created_at', { ascending: false });
  if (tab === 'published') query = query.eq('is_published', true);
  else if (tab === 'hidden') query = query.eq('is_published', false);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Soft-moderation, not delete - keeps the row (and its audit trail: who
 * wrote what, when) but takes it out of every public query
 * (reviews_public_select only returns is_published=true rows). Renter is
 * notified with the reason, same "every moderation action tells the
 * affected user why" convention as vendor doc/application rejection.
 */
export async function hideReview(review, reason) {
  const { data, error } = await supabase
    .from('reviews')
    .update({ is_published: false, hidden_reason: reason || null })
    .eq('id', review.id)
    .select(REVIEW_SELECT)
    .single();
  if (error) throw error;

  await notifyUser({
    userId: review.renter_id,
    type: 'review_hidden',
    title: 'Your review was hidden',
    body: reason || 'Your review did not meet our community guidelines.',
  });
  return data;
}

export async function unhideReview(review) {
  const { data, error } = await supabase
    .from('reviews')
    .update({ is_published: true, hidden_reason: null })
    .eq('id', review.id)
    .select(REVIEW_SELECT)
    .single();
  if (error) throw error;

  await notifyUser({
    userId: review.renter_id,
    type: 'review_published',
    title: 'Your review is live again',
    body: 'Your review has been restored and is visible to other renters.',
  });
  return data;
}

/** Featured reviews are just a curation flag - doesn't change published state, no notification needed (not a moderation decision about the reviewer). */
export async function setReviewFeatured(review, featured) {
  const { data, error } = await supabase
    .from('reviews')
    .update({ is_featured: featured })
    .eq('id', review.id)
    .select(REVIEW_SELECT)
    .single();
  if (error) throw error;
  return data;
}
