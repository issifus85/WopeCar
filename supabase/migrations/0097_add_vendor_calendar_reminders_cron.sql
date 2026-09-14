-- Weekly (Monday 08:00 UTC = 08:00 Accra time, GMT+0 year-round - no DST)
-- reminder nudging every approved vendor with at least one car to review
-- and update their fleet's calendar availability for the coming week. See
-- supabase/functions/send-vendor-calendar-reminders/index.ts for the
-- notification content and the vendor-selection query.
--
-- calendar_reminder_sent_at is a guard column, same idiom as
-- bookings.extend_reminder_sent_at (0093), but checked with a 6-day
-- lookback rather than IS NULL - this reminder is meant to recur every
-- week, not fire once ever, so the guard only exists to stop a duplicate
-- send if this function is invoked twice within the same week.
alter table vendors add column if not exists calendar_reminder_sent_at timestamptz;

create extension if not exists pg_cron;

-- The anon key embedded below is safe to commit - see
-- 0093_add_booking_ending_reminders_cron.sql's comment for why (public,
-- RLS-gated key, not a secret; the function itself only trusts the
-- service-role key for its actual data access).
select cron.schedule(
  'vendor-calendar-reminders',
  '0 8 * * 1',
  $$
  select net.http_post(
    url := 'https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/send-vendor-calendar-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2YWN0eWNudWZhb3d3c2lxZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNjkwMDcsImV4cCI6MjEwMDg0NTAwN30.VRzansMc5kimTQKjUWZbodwRjYfJsQDRwLm24UR1VtM'
    ),
    body := '{}'::jsonb
  );
  $$
);
