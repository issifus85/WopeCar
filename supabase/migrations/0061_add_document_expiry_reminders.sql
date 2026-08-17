-- Automated reminders for expiring car compliance documents (roadworthy/
-- insurance) - previously the only visibility was the red/amber date
-- styling in the admin panel's Compliance Documents section (see
-- wopecar-admin commit a1afd96); nothing proactively told the vendor OR
-- WopeCar support a document needed renewal.
--
-- expiry_notice_stage tracks which reminder has already fired for a
-- document's CURRENT expires_at, so the daily cron job below only emails
-- once per transition (entering the 30-day window, then again on actual
-- expiry) instead of resending the same email every day for a month.
-- Resets to null whenever expires_at changes (a renewal) - see
-- wopecar-admin's updateCarDocumentExpiry() - or a fresh doc is uploaded
-- (a new row, so it naturally starts null), so the next expiry cycle can
-- notify again.
alter table documents add column if not exists expiry_notice_stage text check (expiry_notice_stage in ('expiring_soon', 'expired'));

create extension if not exists pg_cron;

-- Daily at 08:00 UTC. The anon key embedded below is safe to commit - it's
-- a public, RLS-gated key by design (same one already shipped in both the
-- website's and the mobile app's client bundles), not a secret. The target
-- function is deployed --no-verify-jwt, same posture as every other
-- Postgres-triggered function in this project (send-signup-notification,
-- etc.) - the caller here is pg_cron/pg_net, not a Supabase Auth session.
select cron.schedule(
  'car-document-expiry-reminders',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/send-document-expiry-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2YWN0eWNudWZhb3d3c2lxZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNjkwMDcsImV4cCI6MjEwMDg0NTAwN30.VRzansMc5kimTQKjUWZbodwRjYfJsQDRwLm24UR1VtM'
    ),
    body := '{}'::jsonb
  );
  $$
);
