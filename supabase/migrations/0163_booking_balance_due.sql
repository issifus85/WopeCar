-- Balance due on a PAID booking whose total went up through a staff modification (staff don't take a payment at that moment).
-- Until now that shortfall existed only as an internal finance email: the renter saw the new total and was never asked to pay it.
--   bookings.balance_due            what the renter still owes on a paid booking (0 = settled). Written ONLY by modify-booking
--                                   (when staff raise a paid total), confirm-balance-payment / paystack-webhook (a Paystack payment of it)
--                                   and staff recording a payment taken outside the app - never by the renter (trigger below).
--   booking_balance_payments        one row per payment against a balance (Paystack reference unique -> the same payment can never
--                                   be applied twice), readable by the renter and staff, written only by the service role.
alter table public.bookings add column if not exists balance_due numeric(12,2) not null default 0;
alter table public.bookings drop constraint if exists bookings_balance_due_check;
alter table public.bookings add constraint bookings_balance_due_check check (balance_due >= 0);

create table if not exists public.booking_balance_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('paystack', 'manual')),
  reference text unique,
  recorded_by uuid references public.users(id),
  note text,
  qb_payment_id text,
  created_at timestamptz not null default now()
);
create index if not exists booking_balance_payments_booking_idx on public.booking_balance_payments (booking_id);
alter table public.booking_balance_payments enable row level security;

drop policy if exists booking_balance_payments_select on public.booking_balance_payments;
create policy booking_balance_payments_select on public.booking_balance_payments
  for select to authenticated
  using (is_admin() or exists (select 1 from public.bookings b where b.id = booking_id and b.renter_id = auth.uid()));

-- Renters must not be able to clear their own balance: balance_due joins the columns they cannot change on their booking.
create or replace function public.restrict_renter_booking_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if is_admin() then
    return new;
  end if;

  if auth.uid() is null and coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'Not authorized to update this booking.';
  end if;

  if old.renter_id is distinct from auth.uid() then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.booking_ref is distinct from old.booking_ref
    or new.renter_id is distinct from old.renter_id
    or new.car_id is distinct from old.car_id
    or new.vendor_id is distinct from old.vendor_id
    or new.start_date is distinct from old.start_date
    or new.end_date is distinct from old.end_date
    or new.pickup_time is distinct from old.pickup_time
    or new.return_time is distinct from old.return_time
    or new.pickup_location is distinct from old.pickup_location
    or new.return_location is distinct from old.return_location
    or new.drive_type is distinct from old.drive_type
    or new.addon_names is distinct from old.addon_names
    or new.addon_days is distinct from old.addon_days
    or new.rental_cost is distinct from old.rental_cost
    or new.addons_cost is distinct from old.addons_cost
    or new.delivery_fee is distinct from old.delivery_fee
    or new.security_deposit is distinct from old.security_deposit
    or new.total_cost is distinct from old.total_cost
    or new.vendor_payout_per_day is distinct from old.vendor_payout_per_day
    or new.vendor_payout_total is distinct from old.vendor_payout_total
    or new.wopecar_margin is distinct from old.wopecar_margin
    or new.vendor_accepted is distinct from old.vendor_accepted
    or new.created_at is distinct from old.created_at
    or new.payment_status is distinct from old.payment_status
    or new.payment_ref is distinct from old.payment_ref
    or new.refund_amount is distinct from old.refund_amount
    or new.balance_due is distinct from old.balance_due
    or (new.status is distinct from old.status and new.status is distinct from 'cancelled')
  then
    raise exception 'Renters may only cancel their own booking or update its invoice link.';
  end if;

  return new;
end;
$$;
