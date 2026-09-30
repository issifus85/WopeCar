-- Weekly, Tuesday 08:00 UTC (offset one day from vendor-calendar-reminders'
-- Monday slot purely to spread load - no functional dependency between them).
create extension if not exists pg_cron;

select cron.schedule(
  'national-id-reminders',
  '0 8 * * 2',
  $$
  select net.http_post(
    url := 'https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/send-national-id-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2YWN0eWNudWZhb3d3c2lxZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNjkwMDcsImV4cCI6MjEwMDg0NTAwN30.VRzansMc5kimTQKjUWZbodwRjYfJsQDRwLm24UR1VtM'
    ),
    body := '{}'::jsonb
  );
  $$
);
