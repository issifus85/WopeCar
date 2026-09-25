-- Admin-managed recurring/one-off promotional push notifications (Settings
-- > Promotions). Distinct from the existing one-off "Broadcast Notification"
-- tool (lib/api/settings.ts's broadcastNotification, wopecar-admin) - that
-- one sends immediately and is done; this table lets an admin define a
-- campaign that a cron-triggered Edge Function (send-promo-notifications)
-- checks daily and sends on its own schedule, unattended, until it's paused
-- or its end date passes.
--
-- frequency_days: null means "send once" (the cron job flips is_active to
-- false right after that single send, same one-shot pattern as every other
-- reminder guard in this codebase - e.g. extend_reminder_sent_at). A
-- positive integer repeats every N days, gated by last_sent_at so the
-- daily cron doesn't re-send on every run.
create table if not exists promo_notification_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  target text not null default 'renters' check (target in ('all', 'renters', 'vendors', 'admins')),
  frequency_days integer check (frequency_days is null or frequency_days > 0),
  starts_at date not null default current_date,
  ends_at date,
  is_active boolean not null default true,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Admin-only in both directions - this table is never read by the website
-- or mobile app directly, only by this dashboard (is_admin()) and the cron
-- function (service-role, bypasses RLS entirely), so no public select
-- policy is needed at all.
alter table promo_notification_campaigns enable row level security;
create policy promo_notification_campaigns_admin_all on promo_notification_campaigns
  for all using (is_admin()) with check (is_admin());

create extension if not exists pg_cron;

-- Daily (not hourly, unlike the booking-ending-reminders cron) - frequency
-- here is whole days, not a precise time-of-day window, so daily precision
-- is all this needs. 10:00 UTC (~10am Ghana time, UTC+0) is a reasonable
-- mid-morning send, matching this codebase's existing business-hours-ish
-- reminder times (e.g. vendor-calendar-reminders' Monday 8am).
select cron.schedule(
  'promo-notifications',
  '0 10 * * *',
  $$
  select net.http_post(
    url := 'https://tndkuzxaddrwrunhbrap.supabase.co/functions/v1/send-promo-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZGt1enhhZGRyd3J1bmhicmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4Nzc3MjMsImV4cCI6MjEwMzQ1MzcyM30.Xy9eNlzGSiB-DcjHUFhLDCEQMmdViEbIuSSck4hA3U8'
    ),
    body := '{}'::jsonb
  );
  $$
);
