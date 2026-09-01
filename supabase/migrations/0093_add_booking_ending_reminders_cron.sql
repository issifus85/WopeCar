-- Reminds a renter ~24h before their active rental's return time that it's
-- ending soon, with a CTA straight into the existing Modify Booking flow
-- (modify-booking Edge Function + app/booking/[id].js's "Modify Trip
-- Details" section) so they can extend the return date and pay the
-- difference the same way modifying already works - deliberately NOT a new
-- "extend booking" feature, just a nudge toward the one that already exists.
--
-- extend_reminder_sent_at is the same one-reminder-per-row guard pattern as
-- documents.expiry_notice_stage / cars.appointment_reminder_sent_at - keeps
-- the hourly cron from re-notifying the same booking every run once it's
-- inside the reminder window. Left null (not reset) on modification, same
-- as the vetting-appointment guard - if a renter DOES extend after getting
-- the reminder, the new end_date naturally moves the booking's "ending
-- soon" window forward, and a stale sent_at from the old end_date no longer
-- matches it, so nothing needs to reset it explicitly.
alter table bookings add column if not exists extend_reminder_sent_at timestamptz;

create extension if not exists pg_cron;

-- Hourly, same reasoning as vetting-appointment-reminders
-- (0070_vetting_appointment_reminders_cron.sql): end_date + return_time is
-- a precise point in time (not a date-only window like the 30-day document
-- check), so a once-a-day check would badly mistime same-day return
-- windows. The anon key embedded below is safe to commit - see that
-- migration's comment for why.
select cron.schedule(
  'booking-ending-reminders',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/send-booking-ending-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2YWN0eWNudWZhb3d3c2lxZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNjkwMDcsImV4cCI6MjEwMDg0NTAwN30.VRzansMc5kimTQKjUWZbodwRjYfJsQDRwLm24UR1VtM'
    ),
    body := '{}'::jsonb
  );
  $$
);
