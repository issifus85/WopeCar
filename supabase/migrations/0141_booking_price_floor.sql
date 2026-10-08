-- A signed-in renter could INSERT a booking with any total_cost (the insert policy only checks renter_id), and
-- confirm-booking-payment only checks that Paystack was paid >= total_cost, so a forged tiny total meant a near-free
-- booking. Direct client inserts are now checked against server-known prices:
--   * HARD floor: total_cost may not be below 20% of the cheapest applicable day price x a conservative day count.
--     Legit totals always include the security deposit (~25% of rental) even with a 100% promo, so real customers
--     never get near it. Admins and server-side (service role / definer) inserts are exempt.
--   * SHADOW checks (log only, never block): rental below ~60% of list, or total far from the sum of its parts.
--     Reviewed before the hard check is tightened further.
create table if not exists public.booking_price_audit (
  id bigserial primary key,
  booking_id uuid,
  booking_ref text,
  renter_id uuid,
  flags text[] not null,
  rental_cost numeric,
  total_cost numeric,
  expected_list_rental numeric,
  created_at timestamptz not null default now()
);
alter table public.booking_price_audit enable row level security;
revoke all on public.booking_price_audit from anon, authenticated;
grant select on public.booking_price_audit to authenticated;
drop policy if exists booking_price_audit_admin_read on public.booking_price_audit;
create policy booking_price_audit_admin_read on public.booking_price_audit for select to authenticated using (is_admin());

-- Callers hold no INSERT privilege on the audit table, so the log write goes through a definer helper.
create or replace function public.log_booking_price_audit(p_booking_id uuid, p_ref text, p_renter uuid, p_flags text[], p_rental numeric, p_total numeric, p_expected numeric)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into booking_price_audit (booking_id, booking_ref, renter_id, flags, rental_cost, total_cost, expected_list_rental)
  values (p_booking_id, p_ref, p_renter, p_flags, p_rental, p_total, p_expected);
exception when others then
  null; -- the audit trail must never be able to break a booking
end;
$$;
revoke all on function public.log_booking_price_audit(uuid, text, uuid, text[], numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.log_booking_price_audit(uuid, text, uuid, text[], numeric, numeric, numeric) to authenticated, anon;

create or replace function public.check_booking_price()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  ppd numeric;
  min_date_price numeric;
  unit numeric;
  cal_days int;
  parts numeric;
  flags text[] := '{}';
begin
  if current_user not in ('authenticated', 'anon') or is_admin() then
    return new;
  end if;

  select price_per_day into ppd from cars where id = new.car_id;
  if ppd is null then
    return new;
  end if;

  select min(price) into min_date_price from car_date_prices
   where car_id = new.car_id and date between new.start_date and new.end_date;
  unit := least(ppd, coalesce(min_date_price, ppd));
  cal_days := greatest(1, coalesce(new.end_date - new.start_date, 1));

  if new.total_cost < 0.2 * unit * greatest(1, cal_days - 1) then
    raise exception 'This booking total is below the minimum allowed for this vehicle. Please refresh and try again.'
      using errcode = '23514';
  end if;

  if new.rental_cost < 0.6 * unit * cal_days then
    flags := array_append(flags, 'rental_below_list');
  end if;
  parts := coalesce(new.rental_cost, 0) + coalesce(new.addons_cost, 0) + coalesce(new.delivery_fee, 0)
         + coalesce(new.security_deposit, 0) + coalesce(new.wopecare_total_cost, 0) + coalesce(new.with_driver_total_cost, 0)
         - coalesce(new.promo_discount_amount, 0);
  if abs(new.total_cost - parts) > 100 then
    flags := array_append(flags, 'total_not_sum_of_parts');
  end if;

  if array_length(flags, 1) > 0 then
    perform log_booking_price_audit(new.id, new.booking_ref, new.renter_id, flags, new.rental_cost, new.total_cost, unit * cal_days);
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_check_price on public.bookings;
create trigger bookings_check_price
  before insert on public.bookings
  for each row execute function public.check_booking_price();
