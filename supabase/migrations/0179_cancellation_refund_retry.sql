-- Cancellation refunds that Paystack refused are now remembered, retried and alerted on.
--
-- Why: cancel-booking has always worked out the refund and called Paystack itself, for every
-- surface (admin, renter, vendor - one function, one rule). What it could not do was survive a
-- refusal. The refund error went back in the HTTP response, the admin's cancel dialog showed it
-- once, and then it was gone: nothing on the booking, no alert, no retry. On 2026-11-19 two live
-- cancellations hit this - WC-2026-0867 (GH₵14,783.70, cancelled by support) and WC-2026-4007
-- (GH₵6,011.00, cancelled by the renter) - both refused by Paystack for the same reason, an
-- account balance of GH₵0.78 (Paystack funds refunds from the available balance). Neither was
-- recorded anywhere and nothing ever tried again.
--
-- This migration adds the state cancel-booking needs to hand an unfinished refund to a retry
-- sweep (paystack-refund-retry, every 15 minutes), a queue the admin can see, and an audited way
-- to close one out that was returned by hand instead.

-- 1. What is still owed, and out of which Paystack transactions.
alter table public.bookings add column if not exists refund_owed numeric(12,2) not null default 0;
alter table public.bookings add column if not exists refund_plan jsonb;
alter table public.bookings add column if not exists refund_error text;
alter table public.bookings add column if not exists refund_attempts integer not null default 0;
alter table public.bookings add column if not exists refund_last_attempt_at timestamptz;

comment on column public.bookings.refund_owed is
  'Cancellation refund still to return to the renter. Set by cancel-booking when Paystack refuses or only partly accepts the refund; cleared by paystack-refund-retry once it goes through, or by admin_settle_booking_refund() when it was returned by hand. > 0 means a person or the sweep still owes this renter money.';
comment on column public.bookings.refund_plan is
  'The Paystack transactions the outstanding refund comes out of: [{"ref": "<paystack reference>" | null, "cap": <max refundable from it>}]. Persisted rather than recomputed, because the refund tier depends on hours-until-pickup at the moment of cancellation - recomputing it on a retry days later would silently reprice (or zero) a refund the renter was already promised.';
comment on column public.bookings.refund_error is
  'Why the refund did not go through, in words an admin can act on (last attempt). Kept after the refund succeeds only until the next attempt clears it.';
comment on column public.bookings.refund_attempts is
  'How many times a refund has been attempted for this booking, counting the one cancel-booking makes. Drives the alert escalation in paystack-refund-retry.';
comment on column public.bookings.refund_last_attempt_at is 'When the last refund attempt was made (used to space retries out).';

-- The sweep's only query: the outstanding queue. Tiny partial index - almost every booking has 0.
create index if not exists bookings_refund_owed_idx on public.bookings (refund_last_attempt_at nulls first)
  where refund_owed > 0;

-- 2. A refund returned by hand (bank transfer, mobile money, the Paystack dashboard) has to be
--    recordable, or the queue above never empties and the sweep keeps trying to send money that
--    has already gone out.
create table if not exists public.booking_refund_settlements (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  settled_by uuid references public.users(id) on delete set null,
  settled_by_name text,
  amount numeric(12,2) not null,
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists booking_refund_settlements_booking_idx on public.booking_refund_settlements (booking_id);

alter table public.booking_refund_settlements enable row level security;

drop policy if exists "Admins read refund settlements" on public.booking_refund_settlements;
create policy "Admins read refund settlements" on public.booking_refund_settlements
  for select using (public.is_admin());
-- No insert/update/delete policy: rows are only ever written by admin_settle_booking_refund()
-- below (security definer), the same shape as booking_manual_payments.

comment on table public.booking_refund_settlements is
  'Audit trail for cancellation refunds returned outside Paystack. Written only by admin_settle_booking_refund().';

-- 3. Closing out a refund by hand. Mirrors admin_mark_booking_paid(): admin only, a note is
--    required, and it records who did it. Deliberately role = 'admin' rather than also is_support,
--    because this writes off money owed to a renter.
create or replace function public.admin_settle_booking_refund(p_booking_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_owed numeric(12,2);
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can settle a refund.';
  end if;
  if v_note is null then
    raise exception 'Say how the refund was returned (method and reference).';
  end if;

  select refund_owed into v_owed from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found.';
  end if;
  if coalesce(v_owed, 0) <= 0 then
    raise exception 'This booking has no outstanding refund.';
  end if;

  select coalesce(nullif(btrim(coalesce(full_name, '')), ''), email) into v_name from public.users where id = auth.uid();

  insert into public.booking_refund_settlements (booking_id, settled_by, settled_by_name, amount, note)
  values (p_booking_id, auth.uid(), v_name, v_owed, v_note);

  update public.bookings
     set refund_amount = round(coalesce(refund_amount, 0) + v_owed, 2),
         refund_owed = 0,
         refund_plan = null,
         refund_error = null,
         payment_status = case when payment_status = 'paid' then 'refunded' else payment_status end
   where id = p_booking_id;
end;
$fn$;

revoke all on function public.admin_settle_booking_refund(uuid, text) from public, anon;
grant execute on function public.admin_settle_booking_refund(uuid, text) to authenticated;

-- 4. Close the hole these new columns would otherwise open. Both update guards are BLOCKLISTS -
--    they enumerate the columns a renter / vendor may not change - so a brand-new column is
--    writable by them until it is named here. refund_owed in particular must never be settable by
--    the person being refunded.
create or replace function public.restrict_renter_booking_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
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
    or new.refund_owed is distinct from old.refund_owed
    or new.refund_plan is distinct from old.refund_plan
    or new.refund_error is distinct from old.refund_error
    or new.refund_attempts is distinct from old.refund_attempts
    or new.refund_last_attempt_at is distinct from old.refund_last_attempt_at
    or new.balance_due is distinct from old.balance_due
    or (new.status is distinct from old.status and new.status is distinct from 'cancelled')
  then
    raise exception 'Renters may only cancel their own booking or update its invoice link.';
  end if;

  return new;
end;
$fn$;

create or replace function public.restrict_vendor_booking_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if is_admin() then
    return new;
  end if;

  if not is_vendor_owner(old.vendor_id) then
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
    or new.payment_ref is distinct from old.payment_ref
    or new.payment_status is distinct from old.payment_status
    or new.refund_amount is distinct from old.refund_amount
    or new.refund_owed is distinct from old.refund_owed
    or new.refund_plan is distinct from old.refund_plan
    or new.refund_error is distinct from old.refund_error
    or new.refund_attempts is distinct from old.refund_attempts
    or new.refund_last_attempt_at is distinct from old.refund_last_attempt_at
    or new.vendor_payout_per_day is distinct from old.vendor_payout_per_day
    or new.vendor_payout_total is distinct from old.vendor_payout_total
    or new.wopecar_margin is distinct from old.wopecar_margin
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Vendors may only update status and vendor_accepted on a booking.';
  end if;

  return new;
end;
$fn$;

-- 5. The retry sweep, every 15 minutes - the same cadence as paystack-reconcile, and the function
--    spaces its own attempts out (it will not re-try a booking it tried in the last hour), so this
--    costs one near-empty call per quarter hour.
--
--    NOTE: the URL below is this project's. Applying this file to the other project needs its own
--    project ref - same as 0173_paystack_reconcile.sql. No Authorization header: the function is
--    deployed with verify_jwt=false and authenticates on x-cron-secret alone (internal_secrets is
--    RLS-locked to service_role), so there is no anon key to embed here.
create extension if not exists pg_cron;

select cron.unschedule('paystack-refund-retry') where exists (select 1 from cron.job where jobname = 'paystack-refund-retry');

select cron.schedule(
  'paystack-refund-retry',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://tndkuzxaddrwrunhbrap.supabase.co/functions/v1/paystack-refund-retry',
    headers := jsonb_build_object(
      'x-cron-secret', (select value from public.internal_secrets where name = 'cron'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $cron$
);
