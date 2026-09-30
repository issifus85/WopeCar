-- Daily (10:00 UTC) check for "Save & Pay Later" pending_invoices sitting
-- unresolved 3-5 days - abandonment_reminder_sent_at (a one-shot IS NULL
-- guard, not a lookback) is what stops this firing more than once per
-- saved cart, not the schedule.
create extension if not exists pg_cron;

select cron.schedule(
  'website-cart-abandonment-reminders',
  '0 10 * * *',
  $$
  select net.http_post(
    url := 'https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/send-website-cart-abandonment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2YWN0eWNudWZhb3d3c2lxZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNjkwMDcsImV4cCI6MjEwMDg0NTAwN30.VRzansMc5kimTQKjUWZbodwRjYfJsQDRwLm24UR1VtM'
    ),
    body := '{}'::jsonb
  );
  $$
);
