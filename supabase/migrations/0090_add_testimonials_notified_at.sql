-- Admin was never notified by email when a partner submits a "Share your
-- story" testimonial from the website - the submission itself, RLS, and
-- the admin moderation queue were all already working correctly (verified
-- live), only the notification step was missing entirely (no Edge
-- Function, no trigger, nothing). This mirrors booking_inquiries.notified_at
-- (0048_add_booking_inquiries_notified_at.sql) exactly - same idempotency
-- guard, same reasoning: a retried/duplicated notify call for the same row
-- is a no-op, which also caps the blast radius of someone replaying a
-- known id.
alter table testimonials add column if not exists notified_at timestamptz;
