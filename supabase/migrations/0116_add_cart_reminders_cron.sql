-- Daily check (09:00 UTC = 09:00 Accra, no DST) for cart_items sitting 3+
-- days - the lookback-based guard inside send-cart-reminders itself is
-- what actually produces the "every 3 days" cadence, not this schedule;
-- daily is just frequent enough granularity for a 3-day window.
--
-- The anon key embedded below is safe to commit - see
-- 0093_add_booking_ending_reminders_cron.sql's comment for why (public,
-- RLS-gated key, not a secret; the function itself only trusts the
-- service-role key for its actual data access).
create extension if not exists pg_cron;

select cron.schedule(
  'cart-reminders',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/send-cart-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2YWN0eWNudWZhb3d3c2lxZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNjkwMDcsImV4cCI6MjEwMDg0NTAwN30.VRzansMc5kimTQKjUWZbodwRjYfJsQDRwLm24UR1VtM'
    ),
    body := '{}'::jsonb
  );
  $$
);
