-- Wires the (previously admin-JWT-gated, now-public) sync-google-reviews
-- Edge Function to a daily pg_cron job, following the exact pattern
-- already established by car-document-expiry-reminders and
-- vetting-appointment-reminders. Google reviews change slowly, so once a
-- day is plenty. Runs at 06:00 UTC (== 06:00 in Accra, GMT/UTC+0) so a
-- fresh review shows up early in the day rather than overnight.
--
-- This function requires GOOGLE_PLACES_API_KEY and GOOGLE_PLACE_ID to be
-- set as project secrets (Dashboard: Project Settings > Edge Functions >
-- Secrets) - until they are, each run is a safe, harmless no-op that
-- returns a 500 explaining exactly that (see the function's own code).

select cron.schedule(
  'sync-google-reviews',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/sync-google-reviews',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2YWN0eWNudWZhb3d3c2lxZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNjkwMDcsImV4cCI6MjEwMDg0NTAwN30.VRzansMc5kimTQKjUWZbodwRjYfJsQDRwLm24UR1VtM'
    ),
    body := '{}'::jsonb
  );
  $$
);
