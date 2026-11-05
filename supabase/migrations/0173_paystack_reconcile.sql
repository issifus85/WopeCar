-- Paystack catch-up sweep (supabase/functions/paystack-reconcile).
--
-- A Paystack charge only became a paid booking through the client coming back from checkout
-- (confirm-booking-payment and friends) or Paystack's webhook (paystack-webhook). If the customer
-- paid and closed the tab AND the webhook delivery was lost or kept failing, the money was taken
-- and the booking stayed `unpaid` with nobody alerted, until expire_unpaid_bookings cancelled it at
-- the 24h hold. Nothing ever asked Paystack what had actually succeeded. paystack-reconcile does,
-- every 15 minutes, applying anything orphaned through the same code the webhook runs.
--
-- 1. One-shot guards for the two emails app/checkout/payment.js fires itself after a successful
--    charge. They are best-effort client calls, so a booking confirmed only server-side (by the
--    webhook or the sweep) left the renter and the vendor hearing nothing at all - the sweep now
--    fires them, and these columns are what stop a booking ever getting them twice. Both functions
--    claim the column before sending and hand it back if the send fails.
--    (QuickBooks needs no equivalent: quickbooks-reconcile already catches up paid bookings with
--    no invoice.)
alter table public.bookings add column if not exists confirmation_email_sent_at timestamptz;
alter table public.bookings add column if not exists vendor_notified_at timestamptz;

comment on column public.bookings.confirmation_email_sent_at is
  'When the "Booking Received" email was sent (send-booking-confirmation). Claimed before sending, so the email goes out once however many paths fire it.';
comment on column public.bookings.vendor_notified_at is
  'When the vendor was emailed the booking request (send-booking-request-vendor). Claimed before sending, so it goes out once however many paths fire it.';

-- Bookings already paid before this migration must not be emailed retroactively the first time the
-- sweep or the webhook touches them: treat their emails as already sent.
update public.bookings
   set confirmation_email_sent_at = coalesce(paid_at, updated_at, created_at),
       vendor_notified_at = coalesce(paid_at, updated_at, created_at)
 where payment_status = 'paid'
   and confirmation_email_sent_at is null
   and vendor_notified_at is null;

-- 2. confirmBookingsForReference checks whether a reference is already attached to other bookings
--    on every confirmation, and the sweep classifies candidates the same way.
create index if not exists bookings_payment_ref_idx on public.bookings (payment_ref) where payment_ref is not null;

-- 3. Every 15 minutes. Well inside the 24h unpaid hold, so a payment the webhook missed is applied
--    long before the booking would be auto-cancelled; the function's own 48h lookback is what
--    catches anything that slipped past that.
create extension if not exists pg_cron;

select cron.schedule(
  'paystack-reconcile',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/paystack-reconcile',
    headers := jsonb_build_object(
      'x-cron-secret', (select value from public.internal_secrets where name = 'cron'),
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2YWN0eWNudWZhb3d3c2lxZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNjkwMDcsImV4cCI6MjEwMDg0NTAwN30.VRzansMc5kimTQKjUWZbodwRjYfJsQDRwLm24UR1VtM'
    ),
    body := '{}'::jsonb
  );
  $$
);
