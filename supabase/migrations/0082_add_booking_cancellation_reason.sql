-- BACKFILL - already applied live (ledger version 20260804030746, name
-- add_booking_cancellation_reason). Never committed to this repo - this is
-- the column cancel-booking's Edge Function (supabase/functions/
-- cancel-booking/index.ts) writes on every cancellation.

alter table public.bookings add column if not exists cancellation_reason text;
