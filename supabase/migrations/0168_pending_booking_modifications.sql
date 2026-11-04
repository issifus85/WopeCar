-- Paid booking changes that could be lost (Nov 3 2026, booking ending 8392): on the website the renter's change waited only in the
-- browser's localStorage while they paid on Paystack, and was saved only if Paystack sent them back to /account/modify-callback on
-- that same browser. Paying with mobile money on another device, closing the tab, or a refused save meant the money was taken and
-- nothing tied it to the booking.
--
-- Now paystack-initialize (purpose 'modify') saves the requested change here, keyed by the Paystack reference, BEFORE the renter is
-- sent to pay. modify-booking applies it from here (claim -> apply -> applied_at), whichever arrives first: the website callback or
-- paystack-webhook on charge.success. A change that can't be applied keeps last_error so staff can see it.
create table if not exists public.pending_booking_modifications (
  reference text primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  renter_id uuid not null,
  payload jsonb not null,
  amount numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  applied_at timestamptz,
  modification_id uuid,
  last_error text
);
create index if not exists pending_booking_modifications_booking_idx on public.pending_booking_modifications (booking_id);

-- Server-only: written by paystack-initialize, read/applied by modify-booking and paystack-webhook (service role).
alter table public.pending_booking_modifications enable row level security;
revoke all on public.pending_booking_modifications from anon, authenticated;

drop policy if exists pending_booking_modifications_admin_select on public.pending_booking_modifications;
create policy pending_booking_modifications_admin_select on public.pending_booking_modifications
  for select to authenticated using (is_admin() or is_support());
grant select on public.pending_booking_modifications to authenticated;
