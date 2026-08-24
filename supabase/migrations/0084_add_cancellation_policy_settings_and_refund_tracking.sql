-- BACKFILL - already applied live (ledger version 20260804124151, name
-- add_cancellation_policy_settings_and_refund_tracking). Never committed to
-- this repo - these are the three app_settings keys and the refund_amount
-- column cancel-booking's Edge Function already reads/writes.

insert into public.app_settings (key, value, description) values
  ('cancellation_full_refund_hours', '168', 'Hours before pickup for a 100% refund on cancellation'),
  ('cancellation_partial_refund_hours', '24', 'Hours before pickup for the partial-refund tier (below this = no refund)'),
  ('cancellation_partial_refund_percentage', '0.5', 'Refund fraction (0-1) for cancellations between the two thresholds above')
on conflict (key) do nothing;

alter table public.bookings add column if not exists refund_amount numeric not null default 0;
