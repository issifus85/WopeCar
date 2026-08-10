-- Tracks whether the send-inquiry-notification Edge Function has already
-- sent its admin/vendor emails for a given inquiry. That function is called
-- by an anonymous website visitor right after their own anon insert (no
-- JWT - there's no logged-in user on the public site), so unlike every
-- other notification function in this project it can't be locked to "the
-- caller who owns this row". This column is what keeps it idempotent: a
-- retried or duplicated call is a no-op instead of a second round of
-- emails, and it doubles as the guard against someone replaying a known
-- inquiry id to spam the notification endpoint.
alter table booking_inquiries add column if not exists notified_at timestamptz;
