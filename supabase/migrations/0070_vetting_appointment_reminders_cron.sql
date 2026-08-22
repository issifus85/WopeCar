-- Hourly reminder for vetting appointments starting in ~24h. Mirrors
-- 0061_add_document_expiry_reminders.sql's cron pattern exactly, but
-- hourly instead of daily - appointment_start_at is a precise timestamp
-- (not a date-only expiry window), so a once-a-day check would badly
-- mistime afternoon/evening appointments' 24-hour-out windows. The target
-- function (wopecar-admin/supabase/functions/send-vetting-appointment-
-- reminders) lives in a different repo than this migration - same split
-- the QuickBooks integration already established (its Edge Functions live
-- in wopecar-admin, its migrations live here).
select cron.schedule(
  'vetting-appointment-reminders',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/send-vetting-appointment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2YWN0eWNudWZhb3d3c2lxZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNjkwMDcsImV4cCI6MjEwMDg0NTAwN30.VRzansMc5kimTQKjUWZbodwRjYfJsQDRwLm24UR1VtM'
    ),
    body := '{}'::jsonb
  );
  $$
);
