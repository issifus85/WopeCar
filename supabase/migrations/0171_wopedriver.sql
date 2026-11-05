-- WopeDriver: a WopeCar driver for a self-drive rental (add-on) or for the customer's own car.
--
-- One backend for the app and the website (and wopecar-admin):
--   driver_service_settings  - one row: on/off switch, extra-hour rate, hour limits, notice, how far ahead, max days per request
--   driver_service_packages  - the rate card: e.g. Half day 4 hrs, Full day 8 hrs, Long day 12 hrs
--   driver_service_zones     - "Where to?" options with a per-day add-on (Greater Accra = included)
--   driver_bookings          - one request (WD-YYYY-NNNNN), linked to a rental booking for the add-on
--   driver_booking_days      - one row per driver day: date, start time, hours, zone and the price snapshot
--
-- Customers never write these tables directly: create_driver_booking() validates and prices everything server-side
-- (wopedriver_quote() is the single price calculation, and the app/website show the same numbers from it),
-- cancel_driver_booking() lets a customer cancel. Admins (is_admin()) manage everything through RLS.
-- The rates seeded below are placeholders: set the real ones in wopecar-admin > WopeDriver before launch.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------------------------------------------
-- Settings (single row, id = 1)
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.driver_service_settings (
  id int primary key default 1 check (id = 1),
  is_enabled boolean not null default true,
  extra_hour_rate numeric not null default 50 check (extra_hour_rate >= 0),
  min_hours numeric not null default 2 check (min_hours > 0),
  max_hours_per_day numeric not null default 12 check (max_hours_per_day > 0),
  earliest_start_hour numeric not null default 5 check (earliest_start_hour >= 0 and earliest_start_hour < 24),
  latest_end_hour numeric not null default 23 check (latest_end_hour > 0 and latest_end_hour <= 24),
  min_notice_hours int not null default 24 check (min_notice_hours >= 0),
  booking_horizon_days int not null default 90 check (booking_horizon_days > 0),
  max_days_per_request int not null default 14 check (max_days_per_request > 0),
  cancellation_notice_hours int not null default 24 check (cancellation_notice_hours >= 0),
  service_note text default 'Licensed, background-checked WopeCar drivers. WopeCar confirms every request within 24 hours.',
  own_car_note text default 'Your car must be roadworthy, insured and have valid documents.',
  support_phone text,
  updated_at timestamptz not null default now(),
  check (latest_end_hour > earliest_start_hour)
);
insert into public.driver_service_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.driver_service_packages (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  hours numeric not null check (hours > 0),
  price numeric not null check (price >= 0),
  description text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_service_zones (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  description text,
  addon_fee numeric not null default 0 check (addon_fee >= 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Placeholder rate card (only when empty, so a re-run never duplicates or overwrites admin edits).
insert into public.driver_service_packages (label, hours, price, description, sort_order)
select * from (values
  ('Half day', 4::numeric, 250::numeric, 'Up to 4 hours', 1),
  ('Full day', 8::numeric, 400::numeric, 'Up to 8 hours', 2),
  ('Long day', 12::numeric, 550::numeric, 'Up to 12 hours', 3)
) v
where not exists (select 1 from public.driver_service_packages);

insert into public.driver_service_zones (label, description, addon_fee, sort_order)
select * from (values
  ('Within Greater Accra', 'Accra, Tema, Kasoa and nearby', 0::numeric, 1),
  ('Outside Greater Accra', 'Day trips, e.g. Aburi, Akosombo, Ada', 150::numeric, 2),
  ('Long distance', 'e.g. Kumasi, Cape Coast, Takoradi', 350::numeric, 3)
) v
where not exists (select 1 from public.driver_service_zones);

-- ---------------------------------------------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.driver_bookings (
  id uuid primary key default gen_random_uuid(),
  booking_ref text unique not null,
  user_id uuid references public.users(id) on delete set null,
  service_type text not null check (service_type in ('rental_addon', 'own_car')),
  rental_booking_id uuid references public.bookings(id) on delete set null,
  car_description text,
  car_transmission text check (car_transmission in ('Automatic', 'Manual')),
  car_plate text,
  meeting_point text not null,
  uses_rental_pickup boolean not null default false,
  contact_name text,
  contact_phone text not null,
  contact_email text,
  notes text,
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'in_progress', 'completed', 'cancelled', 'declined')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),
  day_count int not null default 0,
  base_total numeric not null default 0,
  extra_total numeric not null default 0,
  addon_total numeric not null default 0,
  total_cost numeric not null default 0,
  first_service_date date,
  last_service_date date,
  assigned_driver_name text,
  assigned_driver_phone text,
  admin_notes text,
  source text not null default 'app' check (source in ('app', 'website', 'admin')),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  cancelled_by text check (cancelled_by in ('customer', 'admin', 'system')),
  notified_at timestamptz,          -- new-request emails sent (send-driver-booking-notification)
  status_notified text,             -- last status the customer was told about
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.driver_bookings add column if not exists status_notified text;
create index if not exists driver_bookings_user_idx on public.driver_bookings (user_id, created_at desc);
create index if not exists driver_bookings_rental_idx on public.driver_bookings (rental_booking_id);
create index if not exists driver_bookings_status_idx on public.driver_bookings (status, first_service_date);

create table if not exists public.driver_booking_days (
  id uuid primary key default gen_random_uuid(),
  driver_booking_id uuid not null references public.driver_bookings(id) on delete cascade,
  service_date date not null,
  start_time time not null,
  hours numeric not null check (hours > 0),
  zone_id uuid references public.driver_service_zones(id) on delete set null,
  zone_label text,
  package_label text,
  base_price numeric not null default 0,
  extra_hours numeric not null default 0,
  extra_price numeric not null default 0,
  addon_price numeric not null default 0,
  total numeric not null default 0,
  unique (driver_booking_id, service_date)
);
create index if not exists driver_booking_days_date_idx on public.driver_booking_days (service_date);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'driver_service_settings_set_updated_at') then
    create trigger driver_service_settings_set_updated_at before update on public.driver_service_settings for each row execute function set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'driver_service_packages_set_updated_at') then
    create trigger driver_service_packages_set_updated_at before update on public.driver_service_packages for each row execute function set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'driver_service_zones_set_updated_at') then
    create trigger driver_service_zones_set_updated_at before update on public.driver_service_zones for each row execute function set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'driver_bookings_set_updated_at') then
    create trigger driver_bookings_set_updated_at before update on public.driver_bookings for each row execute function set_updated_at();
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------------------------
alter table public.driver_service_settings enable row level security;
alter table public.driver_service_packages enable row level security;
alter table public.driver_service_zones enable row level security;
alter table public.driver_bookings enable row level security;
alter table public.driver_booking_days enable row level security;

drop policy if exists driver_service_settings_public_select on public.driver_service_settings;
create policy driver_service_settings_public_select on public.driver_service_settings for select to public using (true);
drop policy if exists driver_service_settings_admin_all on public.driver_service_settings;
create policy driver_service_settings_admin_all on public.driver_service_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists driver_service_packages_public_select on public.driver_service_packages;
create policy driver_service_packages_public_select on public.driver_service_packages for select to public using (is_active or public.is_admin());
drop policy if exists driver_service_packages_admin_all on public.driver_service_packages;
create policy driver_service_packages_admin_all on public.driver_service_packages for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists driver_service_zones_public_select on public.driver_service_zones;
create policy driver_service_zones_public_select on public.driver_service_zones for select to public using (is_active or public.is_admin());
drop policy if exists driver_service_zones_admin_all on public.driver_service_zones;
create policy driver_service_zones_admin_all on public.driver_service_zones for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Customers read their own requests; support staff and admins read all. Only admins write directly.
drop policy if exists driver_bookings_select on public.driver_bookings;
create policy driver_bookings_select on public.driver_bookings for select to authenticated
  using (user_id = auth.uid() or public.is_support());
drop policy if exists driver_bookings_admin_all on public.driver_bookings;
create policy driver_bookings_admin_all on public.driver_bookings for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists driver_booking_days_select on public.driver_booking_days;
create policy driver_booking_days_select on public.driver_booking_days for select to authenticated
  using (exists (select 1 from public.driver_bookings d where d.id = driver_booking_id and (d.user_id = auth.uid() or public.is_support())));
drop policy if exists driver_booking_days_admin_all on public.driver_booking_days;
create policy driver_booking_days_admin_all on public.driver_booking_days for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------------------------------------------
-- Pricing: one day. Picks the cheapest way to cover the hours: a package (plus extra hours past it at the extra-hour
-- rate), or plain hourly when there are no packages. Ties go to fewer extra hours, then the smaller package.
-- services/wopedriverPricing.js mirrors this exactly for the live estimate; this function is what is charged.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.wopedriver_price_day(p_hours numeric, p_zone_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  s public.driver_service_settings%rowtype;
  z public.driver_service_zones%rowtype;
  v_label text;
  v_base numeric;
  v_extra_hours numeric;
begin
  select * into s from public.driver_service_settings where id = 1;
  select * into z from public.driver_service_zones where id = p_zone_id and is_active;
  if not found then raise exception 'Choose where the driver is going.'; end if;

  select p.label, p.price, greatest(p_hours - p.hours, 0)
    into v_label, v_base, v_extra_hours
  from public.driver_service_packages p
  where p.is_active
  order by p.price + greatest(p_hours - p.hours, 0) * s.extra_hour_rate, greatest(p_hours - p.hours, 0), p.hours
  limit 1;

  if v_label is null then
    v_label := 'Hourly';
    v_base := 0;
    v_extra_hours := p_hours;
  end if;

  return jsonb_build_object(
    'package_label', v_label,
    'base_price', v_base,
    'extra_hours', v_extra_hours,
    'extra_price', v_extra_hours * s.extra_hour_rate,
    'addon_price', z.addon_fee,
    'zone_id', z.id,
    'zone_label', z.label,
    'total', v_base + v_extra_hours * s.extra_hour_rate + z.addon_fee
  );
end;
$$;

-- 5 -> '5:00 AM', 13.5 -> '1:30 PM', 24 -> '12:00 AM (midnight)' - for error messages.
create or replace function public.wopedriver_hour_label(p_hour numeric)
returns text
language sql
immutable
as $$
  select case when p_hour >= 24 then 'midnight'
    else ((floor(p_hour)::int + 11) % 12 + 1)::text || ':' || lpad((round((p_hour % 1) * 60))::int::text, 2, '0')
         || case when p_hour < 12 then ' AM' else ' PM' end end;
$$;

-- Quote a whole request: p_days = [{ "date": "2026-11-20", "start": "08:00", "hours": 8, "zone_id": "<uuid>" }, ...]
-- Checks every day against the settings (hours, start/end window). Date rules that depend on who is booking
-- (rental dates, notice, horizon) are checked in create_driver_booking().
create or replace function public.wopedriver_quote(p_days jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  s public.driver_service_settings%rowtype;
  d jsonb;
  v_date date;
  v_start time;
  v_start_h numeric;
  v_hours numeric;
  v_day jsonb;
  v_days jsonb := '[]'::jsonb;
  v_base numeric := 0; v_extra numeric := 0; v_addon numeric := 0; v_total numeric := 0;
begin
  select * into s from public.driver_service_settings where id = 1;
  if p_days is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) = 0 then
    raise exception 'Pick at least one day.';
  end if;
  if jsonb_array_length(p_days) > s.max_days_per_request then
    raise exception 'You can book up to % days per request.', s.max_days_per_request;
  end if;

  for d in select * from jsonb_array_elements(p_days) loop
    begin
      v_date := (d->>'date')::date;
      v_start := (d->>'start')::time;
      v_hours := (d->>'hours')::numeric;
    exception when others then
      raise exception 'One of the days is missing a date, start time or hours.';
    end;
    if v_date is null or v_start is null or v_hours is null then
      raise exception 'One of the days is missing a date, start time or hours.';
    end if;
    v_start_h := extract(epoch from v_start) / 3600.0;
    if v_hours < s.min_hours then raise exception 'The minimum is % hours a day.', s.min_hours; end if;
    if v_hours > s.max_hours_per_day then raise exception 'The maximum is % hours a day.', s.max_hours_per_day; end if;
    if v_start_h < s.earliest_start_hour then
      raise exception 'On %, the driver can start from % at the earliest.', v_date, public.wopedriver_hour_label(s.earliest_start_hour);
    end if;
    if v_start_h + v_hours > s.latest_end_hour then
      raise exception 'The driver day on % must end by %.', v_date, public.wopedriver_hour_label(s.latest_end_hour);
    end if;

    v_day := public.wopedriver_price_day(v_hours, nullif(d->>'zone_id', '')::uuid)
      || jsonb_build_object('date', v_date, 'start', to_char(v_start, 'HH24:MI'), 'hours', v_hours);
    v_days := v_days || jsonb_build_array(v_day);
    v_base := v_base + (v_day->>'base_price')::numeric;
    v_extra := v_extra + (v_day->>'extra_price')::numeric;
    v_addon := v_addon + (v_day->>'addon_price')::numeric;
    v_total := v_total + (v_day->>'total')::numeric;
  end loop;

  return jsonb_build_object('days', v_days, 'base_total', v_base, 'extra_total', v_extra, 'addon_total', v_addon, 'total', v_total);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Create a request (app and website). Returns { id, booking_ref, total_cost }.
-- p = {
--   service_type: 'rental_addon' | 'own_car',
--   rental_booking_id (rental_addon), uses_rental_pickup (bool),
--   car_description, car_transmission, car_plate (own_car),
--   meeting_point, contact_name, contact_phone, contact_email, notes, source ('app' | 'website'),
--   days: [ { date, start, hours, zone_id } ]
-- }
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.create_driver_booking(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  s public.driver_service_settings%rowtype;
  v_uid uuid := auth.uid();
  v_user public.users%rowtype;
  r public.bookings%rowtype;
  v_type text := p->>'service_type';
  v_quote jsonb;
  v_day jsonb;
  v_meeting text := nullif(trim(coalesce(p->>'meeting_point', '')), '');
  v_uses_pickup boolean := coalesce((p->>'uses_rental_pickup')::boolean, false);
  v_phone text := nullif(trim(coalesce(p->>'contact_phone', '')), '');
  v_car text := nullif(trim(coalesce(p->>'car_description', '')), '');
  v_trans text;
  v_source text := coalesce(nullif(p->>'source', ''), 'app');
  v_today date := (now() at time zone 'Africa/Accra')::date;
  v_first date; v_last date;
  v_ref text;
  v_id uuid;
  v_dates date[];
  v_clash date;
  i int := 0;
begin
  if v_uid is null then raise exception 'Please sign in to book a driver.'; end if;
  select * into s from public.driver_service_settings where id = 1;
  if not s.is_enabled then raise exception 'WopeDriver is not taking new requests right now.'; end if;
  select * into v_user from public.users where id = v_uid;
  if v_type is null or v_type not in ('rental_addon', 'own_car') then raise exception 'Choose a WopeDriver service.'; end if;
  if v_source not in ('app', 'website') then v_source := 'app'; end if;
  if v_phone is null or length(regexp_replace(v_phone, '\D', '', 'g')) < 9 then raise exception 'Enter a phone number the driver can reach you on.'; end if;

  v_quote := public.wopedriver_quote(p->'days');

  select array_agg((x->>'date')::date order by (x->>'date')::date) into v_dates from jsonb_array_elements(v_quote->'days') x;
  if (select count(distinct dd) from unnest(v_dates) dd) <> array_length(v_dates, 1) then
    raise exception 'Each day can only be added once.';
  end if;
  v_first := v_dates[1];
  v_last := v_dates[array_length(v_dates, 1)];

  -- Notice and horizon (Ghana time, which is UTC+0 all year).
  for v_day in select * from jsonb_array_elements(v_quote->'days') loop
    if ((v_day->>'date')::date + (v_day->>'start')::time) at time zone 'Africa/Accra' < now() + make_interval(hours => s.min_notice_hours) then
      raise exception 'Driver requests need at least % hours'' notice (% at %).', s.min_notice_hours, v_day->>'date', v_day->>'start';
    end if;
  end loop;
  if v_last > v_today + s.booking_horizon_days then
    raise exception 'You can book a driver up to % days ahead.', s.booking_horizon_days;
  end if;

  if v_type = 'rental_addon' then
    select * into r from public.bookings where id = nullif(p->>'rental_booking_id', '')::uuid;
    if not found or r.renter_id is distinct from v_uid then raise exception 'Choose one of your WopeCar rentals.'; end if;
    if r.status not in ('pending', 'confirmed') or r.payment_status <> 'paid' then
      raise exception 'A driver can only be added to a paid rental that is not cancelled or completed.';
    end if;
    if coalesce(r.with_driver, false) or lower(coalesce(r.drive_type, '')) not like 'self%' then
      raise exception 'This rental already comes with a driver.';
    end if;
    if v_first < r.start_date or v_last > r.end_date then
      raise exception 'Driver days must be within your rental (% to %).', r.start_date, r.end_date;
    end if;
    select dd.service_date into v_clash
      from public.driver_booking_days dd join public.driver_bookings b on b.id = dd.driver_booking_id
      where b.rental_booking_id = r.id and b.status in ('requested', 'confirmed', 'in_progress') and dd.service_date = any (v_dates)
      limit 1;
    if v_clash is not null then raise exception 'You already have a driver requested for %.', v_clash; end if;
    if v_uses_pickup then
      v_meeting := coalesce(nullif(trim(coalesce(r.pickup_location, '')), ''), v_meeting);
    end if;
    select coalesce(nullif(trim(concat_ws(' ', c.make, c.model)), ''), c.name), c.transmission
      into v_car, v_trans from public.cars c where c.id = r.car_id;
  else
    v_uses_pickup := false;
    v_trans := case when p->>'car_transmission' in ('Automatic', 'Manual') then p->>'car_transmission' end;
    if v_car is null or length(v_car) < 2 then raise exception 'Tell us the make and model of your car.'; end if;
  end if;

  if v_meeting is null or length(v_meeting) < 3 then
    raise exception 'Enter where the driver should meet you.';
  end if;

  loop
    i := i + 1;
    v_ref := 'WD-' || to_char(v_today, 'YYYY') || '-' || lpad((floor(random() * 100000))::int::text, 5, '0');
    exit when not exists (select 1 from public.driver_bookings where booking_ref = v_ref);
    if i > 20 then raise exception 'Could not create a booking reference, please try again.'; end if;
  end loop;

  insert into public.driver_bookings (
    booking_ref, user_id, service_type, rental_booking_id, car_description, car_transmission, car_plate,
    meeting_point, uses_rental_pickup, contact_name, contact_phone, contact_email, notes, source,
    day_count, base_total, extra_total, addon_total, total_cost, first_service_date, last_service_date
  ) values (
    v_ref, v_uid, v_type, case when v_type = 'rental_addon' then r.id end, left(v_car, 120),
    case when v_trans in ('Automatic', 'Manual') then v_trans end,
    case when v_type = 'own_car' then left(nullif(trim(coalesce(p->>'car_plate', '')), ''), 20) end,
    left(v_meeting, 300), v_uses_pickup,
    left(coalesce(nullif(trim(coalesce(p->>'contact_name', '')), ''), v_user.full_name), 120), left(v_phone, 30),
    left(coalesce(nullif(trim(coalesce(p->>'contact_email', '')), ''), v_user.email), 200),
    left(nullif(trim(coalesce(p->>'notes', '')), ''), 1000), v_source,
    jsonb_array_length(v_quote->'days'), (v_quote->>'base_total')::numeric, (v_quote->>'extra_total')::numeric,
    (v_quote->>'addon_total')::numeric, (v_quote->>'total')::numeric, v_first, v_last
  ) returning id into v_id;

  insert into public.driver_booking_days (driver_booking_id, service_date, start_time, hours, zone_id, zone_label, package_label, base_price, extra_hours, extra_price, addon_price, total)
  select v_id, (x->>'date')::date, (x->>'start')::time, (x->>'hours')::numeric, (x->>'zone_id')::uuid, x->>'zone_label', x->>'package_label',
         (x->>'base_price')::numeric, (x->>'extra_hours')::numeric, (x->>'extra_price')::numeric, (x->>'addon_price')::numeric, (x->>'total')::numeric
  from jsonb_array_elements(v_quote->'days') x;

  return jsonb_build_object('id', v_id, 'booking_ref', v_ref, 'total_cost', (v_quote->>'total')::numeric);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Customer cancels. A request not yet confirmed can always be cancelled; a confirmed one only until
-- cancellation_notice_hours before the first driver day starts (after that, contact support).
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.cancel_driver_booking(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s public.driver_service_settings%rowtype;
  b public.driver_bookings%rowtype;
  v_first_start timestamptz;
begin
  select * into s from public.driver_service_settings where id = 1;
  select * into b from public.driver_bookings where id = p_id for update;
  if not found or b.user_id is distinct from auth.uid() then raise exception 'Driver booking not found.'; end if;
  if b.status not in ('requested', 'confirmed') then raise exception 'This driver booking can no longer be cancelled in the app.'; end if;
  if b.status = 'confirmed' then
    select min((d.service_date + d.start_time) at time zone 'Africa/Accra') into v_first_start
      from public.driver_booking_days d where d.driver_booking_id = b.id;
    if v_first_start < now() + make_interval(hours => s.cancellation_notice_hours) then
      raise exception 'Your driver is less than % hours away. Please contact WopeCar support to cancel.', s.cancellation_notice_hours;
    end if;
  end if;
  update public.driver_bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = 'customer',
         cancel_reason = left(nullif(trim(coalesce(p_reason, '')), ''), 500)
   where id = b.id;
end;
$$;

-- When a rental is cancelled, its open driver add-ons are cancelled with it.
create or replace function public.cancel_driver_addons_with_rental()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.driver_bookings
       set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system',
           cancel_reason = coalesce(cancel_reason, 'Rental ' || new.booking_ref || ' was cancelled')
     where rental_booking_id = new.id and status in ('requested', 'confirmed');
  end if;
  return new;
end;
$$;
drop trigger if exists bookings_cancel_driver_addons on public.bookings;
create trigger bookings_cancel_driver_addons after update of status on public.bookings
  for each row execute function public.cancel_driver_addons_with_rental();

-- Admin status changes stamp confirmed_at / cancelled_at.
create or replace function public.driver_bookings_status_stamps()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'confirmed' and new.confirmed_at is null then new.confirmed_at := now(); end if;
    if new.status in ('cancelled', 'declined') and new.cancelled_at is null then
      new.cancelled_at := now();
      new.cancelled_by := coalesce(new.cancelled_by, 'admin');
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists driver_bookings_status_stamps on public.driver_bookings;
create trigger driver_bookings_status_stamps before update on public.driver_bookings
  for each row execute function public.driver_bookings_status_stamps();

revoke all on function public.wopedriver_price_day(numeric, uuid) from public;
revoke all on function public.create_driver_booking(jsonb) from public, anon;
revoke all on function public.cancel_driver_booking(uuid, text) from public, anon;
grant execute on function public.wopedriver_price_day(numeric, uuid) to anon, authenticated;
grant execute on function public.wopedriver_quote(jsonb) to anon, authenticated;
grant execute on function public.create_driver_booking(jsonb) to authenticated;
grant execute on function public.cancel_driver_booking(uuid, text) to authenticated;
