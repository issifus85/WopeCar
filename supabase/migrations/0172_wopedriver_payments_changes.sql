-- WopeDriver, part 2 (after 0171_wopedriver.sql): pay with Paystack, and change a request after sending it.
--
-- Payments
--   driver_booking_payments - one row per payment (Paystack reference unique, so a payment can never be counted twice).
--   driver_bookings.amount_paid / paid_at - running total. payment_status is 'paid' once amount_paid covers total_cost,
--   'unpaid' while something is still due, 'refunded' when an admin refunds it.
--   apply_driver_booking_payment() is the only writer; it is service-role only (called by confirm-driver-booking-payment
--   and paystack-webhook after they verify the transaction with Paystack).
--
-- Changes
--   modify_driver_booking(p_id, p) - the customer changes days, times, destinations, meeting point, contact or notes.
--   Same checks and pricing as create_driver_booking(). A confirmed request goes back to 'requested' so WopeCar re-checks
--   driver availability. If the new total is higher than what was paid, the difference is due; if it is lower, WopeCar
--   refunds the difference (amount_paid > total_cost shows it in the admin).
--
-- Safe to run more than once.

alter table public.driver_bookings add column if not exists amount_paid numeric not null default 0;
alter table public.driver_bookings add column if not exists paid_at timestamptz;
alter table public.driver_bookings add column if not exists modification_count int not null default 0;
alter table public.driver_bookings add column if not exists modification_notified int not null default 0;
alter table public.driver_bookings add column if not exists last_modified_at timestamptz;

create table if not exists public.driver_booking_payments (
  id uuid primary key default gen_random_uuid(),
  driver_booking_id uuid not null references public.driver_bookings(id) on delete cascade,
  amount numeric not null check (amount > 0),
  method text not null default 'paystack' check (method in ('paystack', 'manual')),
  reference text unique,
  recorded_by uuid references public.users(id) on delete set null,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists driver_booking_payments_booking_idx on public.driver_booking_payments (driver_booking_id);

alter table public.driver_booking_payments enable row level security;
drop policy if exists driver_booking_payments_owner_select on public.driver_booking_payments;
create policy driver_booking_payments_owner_select on public.driver_booking_payments for select to authenticated
  using (exists (select 1 from public.driver_bookings b where b.id = driver_booking_id and b.user_id = auth.uid()) or public.is_support());
drop policy if exists driver_booking_payments_admin_all on public.driver_booking_payments;
create policy driver_booking_payments_admin_all on public.driver_booking_payments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------------------------------------------
-- Record a payment. Returns { status: 'applied' | 'already_applied', payment_id, amount_paid, amount_due }.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.apply_driver_booking_payment(
  p_booking_id uuid, p_amount numeric, p_method text default 'paystack', p_reference text default null, p_recorded_by uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  b public.driver_bookings%rowtype;
  v_existing public.driver_booking_payments%rowtype;
  v_id uuid;
  v_paid numeric;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'The amount must be greater than zero.'; end if;
  select * into b from public.driver_bookings where id = p_booking_id for update;
  if not found then raise exception 'Driver booking not found.'; end if;

  if p_reference is not null then
    select * into v_existing from public.driver_booking_payments where reference = p_reference;
    if found then
      return jsonb_build_object('status', 'already_applied', 'payment_id', v_existing.id,
        'amount_paid', b.amount_paid, 'amount_due', greatest(b.total_cost - b.amount_paid, 0));
    end if;
  end if;

  insert into public.driver_booking_payments (driver_booking_id, amount, method, reference, recorded_by)
  values (b.id, round(p_amount, 2), coalesce(p_method, 'paystack'), p_reference, p_recorded_by)
  returning id into v_id;

  v_paid := round(b.amount_paid + p_amount, 2);
  update public.driver_bookings
     set amount_paid = v_paid,
         paid_at = coalesce(paid_at, now()),
         payment_status = case when v_paid >= total_cost - 0.005 then 'paid' else 'unpaid' end
   where id = b.id;

  return jsonb_build_object('status', 'applied', 'payment_id', v_id, 'amount_paid', v_paid, 'amount_due', greatest(b.total_cost - v_paid, 0));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Customer changes a request. p has the same fields as create_driver_booking() (service type and rental can't change).
-- Returns { id, booking_ref, total_cost, amount_paid, amount_due, status }.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.modify_driver_booking(p_id uuid, p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  s public.driver_service_settings%rowtype;
  b public.driver_bookings%rowtype;
  r public.bookings%rowtype;
  v_quote jsonb;
  v_day jsonb;
  v_dates date[];
  v_first date; v_last date;
  v_clash date;
  v_first_start timestamptz;
  v_today date := (now() at time zone 'Africa/Accra')::date;
  v_meeting text := nullif(trim(coalesce(p->>'meeting_point', '')), '');
  v_uses_pickup boolean := coalesce((p->>'uses_rental_pickup')::boolean, false);
  v_phone text := nullif(trim(coalesce(p->>'contact_phone', '')), '');
  v_car text := nullif(trim(coalesce(p->>'car_description', '')), '');
  v_total numeric;
  v_status text;
begin
  select * into s from public.driver_service_settings where id = 1;
  select * into b from public.driver_bookings where id = p_id for update;
  if not found or b.user_id is distinct from auth.uid() then raise exception 'Driver booking not found.'; end if;
  if b.status not in ('requested', 'confirmed') then raise exception 'This driver booking can no longer be changed in the app.'; end if;

  select min((d.service_date + d.start_time) at time zone 'Africa/Accra') into v_first_start
    from public.driver_booking_days d where d.driver_booking_id = b.id;
  if b.status = 'confirmed' and v_first_start < now() + make_interval(hours => s.cancellation_notice_hours) then
    raise exception 'Your driver is less than % hours away. Please contact WopeCar support to make changes.', s.cancellation_notice_hours;
  end if;
  if v_phone is null or length(regexp_replace(v_phone, '\D', '', 'g')) < 9 then raise exception 'Enter a phone number the driver can reach you on.'; end if;

  v_quote := public.wopedriver_quote(p->'days');
  select array_agg((x->>'date')::date order by (x->>'date')::date) into v_dates from jsonb_array_elements(v_quote->'days') x;
  if (select count(distinct dd) from unnest(v_dates) dd) <> array_length(v_dates, 1) then
    raise exception 'Each day can only be added once.';
  end if;
  v_first := v_dates[1];
  v_last := v_dates[array_length(v_dates, 1)];

  for v_day in select * from jsonb_array_elements(v_quote->'days') loop
    if ((v_day->>'date')::date + (v_day->>'start')::time) at time zone 'Africa/Accra' < now() + make_interval(hours => s.min_notice_hours) then
      raise exception 'Driver requests need at least % hours'' notice (% at %).', s.min_notice_hours, v_day->>'date', v_day->>'start';
    end if;
  end loop;
  if v_last > v_today + s.booking_horizon_days then
    raise exception 'You can book a driver up to % days ahead.', s.booking_horizon_days;
  end if;

  if b.service_type = 'rental_addon' then
    select * into r from public.bookings where id = b.rental_booking_id;
    if not found or r.status not in ('pending', 'confirmed') or r.payment_status <> 'paid' then
      raise exception 'The rental for this driver booking is no longer active.';
    end if;
    if v_first < r.start_date or v_last > r.end_date then
      raise exception 'Driver days must be within your rental (% to %).', r.start_date, r.end_date;
    end if;
    select dd.service_date into v_clash
      from public.driver_booking_days dd join public.driver_bookings ob on ob.id = dd.driver_booking_id
      where ob.rental_booking_id = r.id and ob.id <> b.id and ob.status in ('requested', 'confirmed', 'in_progress')
        and dd.service_date = any (v_dates)
      limit 1;
    if v_clash is not null then raise exception 'You already have a driver requested for %.', v_clash; end if;
    if v_uses_pickup then
      v_meeting := coalesce(nullif(trim(coalesce(r.pickup_location, '')), ''), v_meeting);
    end if;
    v_car := b.car_description;
  else
    v_uses_pickup := false;
    if v_car is null or length(v_car) < 2 then raise exception 'Tell us the make and model of your car.'; end if;
  end if;

  if v_meeting is null or length(v_meeting) < 3 then raise exception 'Enter where the driver should meet you.'; end if;

  v_total := (v_quote->>'total')::numeric;
  v_status := 'requested';

  update public.driver_bookings set
    car_description = left(v_car, 120),
    car_transmission = case when b.service_type = 'own_car' then
      case when p->>'car_transmission' in ('Automatic', 'Manual') then p->>'car_transmission' else car_transmission end
      else car_transmission end,
    car_plate = case when b.service_type = 'own_car' then left(nullif(trim(coalesce(p->>'car_plate', '')), ''), 20) else car_plate end,
    meeting_point = left(v_meeting, 300),
    uses_rental_pickup = v_uses_pickup,
    contact_name = left(coalesce(nullif(trim(coalesce(p->>'contact_name', '')), ''), contact_name), 120),
    contact_phone = left(v_phone, 30),
    notes = left(nullif(trim(coalesce(p->>'notes', '')), ''), 1000),
    status = v_status,
    status_notified = case when b.status = 'confirmed' then null else status_notified end,
    confirmed_at = case when b.status = 'confirmed' then null else confirmed_at end,
    day_count = jsonb_array_length(v_quote->'days'),
    base_total = (v_quote->>'base_total')::numeric,
    extra_total = (v_quote->>'extra_total')::numeric,
    addon_total = (v_quote->>'addon_total')::numeric,
    total_cost = v_total,
    payment_status = case when amount_paid > 0 and amount_paid >= v_total - 0.005 then 'paid' else 'unpaid' end,
    first_service_date = v_first,
    last_service_date = v_last,
    modification_count = modification_count + 1,
    last_modified_at = now()
  where id = b.id;

  delete from public.driver_booking_days where driver_booking_id = b.id;
  insert into public.driver_booking_days (driver_booking_id, service_date, start_time, hours, zone_id, zone_label, package_label, base_price, extra_hours, extra_price, addon_price, total)
  select b.id, (x->>'date')::date, (x->>'start')::time, (x->>'hours')::numeric, (x->>'zone_id')::uuid, x->>'zone_label', x->>'package_label',
         (x->>'base_price')::numeric, (x->>'extra_hours')::numeric, (x->>'extra_price')::numeric, (x->>'addon_price')::numeric, (x->>'total')::numeric
  from jsonb_array_elements(v_quote->'days') x;

  return jsonb_build_object('id', b.id, 'booking_ref', b.booking_ref, 'total_cost', v_total, 'amount_paid', b.amount_paid,
    'amount_due', greatest(v_total - b.amount_paid, 0), 'status', v_status);
end;
$$;

revoke all on function public.apply_driver_booking_payment(uuid, numeric, text, text, uuid) from public, anon, authenticated;
grant execute on function public.apply_driver_booking_payment(uuid, numeric, text, text, uuid) to service_role;
revoke all on function public.modify_driver_booking(uuid, jsonb) from public, anon;
grant execute on function public.modify_driver_booking(uuid, jsonb) to authenticated;
