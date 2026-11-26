-- Fleet Officer, Phase 4 (PREPROD ONLY until the release gate): live location and ETA while an officer is on the way.
--
--   officer_locations   one row per location fix the officer's phone sends while a trip is En route (every 5-10 s, at most one per 4 s
--                       is kept). Kept 30 days (daily cron). The renter of that booking can read the fixes of an active trip, which is
--                       what Supabase Realtime streams to their map.
--   trip_tasks          + last known position, cached destination coordinates, the server-computed ETA / distance / route line, and
--                       sharing_stopped_at (the officer tapped Stop, or the trip moved past En route).
--   officer_share_location(...)    the officer app's only way to write a fix (assigned officer, trip En route, sharing on).
--   officer_set_location_sharing() the officer's Stop / Resume.
--   renter_trip_live(...)          what the renter's chat card and full-screen map read: officer name + photo, position, ETA, state.
--   fo_save_trip_eta(...)          used by the fleet-trip-eta Edge Function (service role) to store the ETA it computed with Google
--                                  Directions (key held server-side only), or a straight-line estimate when that call fails.
--   officer_advance_trip_task       redefined (same rules as 0189): the renter's "on the way" / "arrived" pushes now open the live map,
--                                  and starting / ending the trip turns sharing on / off.
-- Safe to run more than once.

alter table public.trip_tasks add column if not exists last_lat double precision;
alter table public.trip_tasks add column if not exists last_lng double precision;
alter table public.trip_tasks add column if not exists last_heading double precision;
alter table public.trip_tasks add column if not exists last_location_at timestamptz;
alter table public.trip_tasks add column if not exists dest_lat double precision;
alter table public.trip_tasks add column if not exists dest_lng double precision;
alter table public.trip_tasks add column if not exists eta_seconds integer;
alter table public.trip_tasks add column if not exists eta_distance_m integer;
alter table public.trip_tasks add column if not exists eta_source text;
alter table public.trip_tasks add column if not exists eta_updated_at timestamptz;
alter table public.trip_tasks add column if not exists route_polyline text;
alter table public.trip_tasks add column if not exists sharing_stopped_at timestamptz;

create table if not exists public.officer_locations (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.trip_tasks(id) on delete cascade,
  officer_id uuid not null references public.users(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  heading double precision,
  speed double precision,
  accuracy double precision,
  recorded_at timestamptz not null default now()
);
create index if not exists officer_locations_task_idx on public.officer_locations (task_id, recorded_at desc);
create index if not exists officer_locations_recorded_idx on public.officer_locations (recorded_at);

alter table public.officer_locations enable row level security;
drop policy if exists officer_locations_admin_select on public.officer_locations;
create policy officer_locations_admin_select on public.officer_locations for select to authenticated using (is_admin());
drop policy if exists officer_locations_officer_select on public.officer_locations;
create policy officer_locations_officer_select on public.officer_locations for select to authenticated using (officer_id = auth.uid());
-- The renter sees the officer's position only for their own booking, and only while that trip is live (En route / Arrived).
-- (Checked by a definer helper: the renter has no read access to trip_tasks itself.)
create or replace function public.fo_renter_sees_live_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from trip_tasks t join bookings b on b.id = t.booking_id
    where t.id = p_task_id and b.renter_id = auth.uid() and t.status in ('en_route', 'arrived')
  );
$$;
revoke all on function public.fo_renter_sees_live_task(uuid) from public, anon;
grant execute on function public.fo_renter_sees_live_task(uuid) to authenticated;

drop policy if exists officer_locations_renter_select on public.officer_locations;
create policy officer_locations_renter_select on public.officer_locations for select to authenticated
  using (fo_renter_sees_live_task(task_id));
-- No insert / update / delete policies: fixes are written only through officer_share_location().

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'officer_locations') then
    execute 'alter publication supabase_realtime add table public.officer_locations';
  end if;
end $$;

-- ---- officer: send a fix, stop / resume sharing ---------------------------------------------------------------------------------------

-- Returns whether the app should keep sharing, and whether the ETA is due for a refresh (older than 30 s).
create or replace function public.officer_share_location(
  p_task_id uuid, p_lat double precision, p_lng double precision,
  p_heading double precision default null, p_speed double precision default null, p_accuracy double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t trip_tasks%rowtype;
begin
  select * into t from trip_tasks where id = p_task_id;
  if not found or t.officer_id is distinct from auth.uid() or not is_fleet_officer() then
    raise exception 'This trip is not assigned to you.' using errcode = '42501';
  end if;
  if t.status <> 'en_route' or t.sharing_stopped_at is not null then
    return jsonb_build_object('sharing', false, 'eta_due', false);
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Invalid location.' using errcode = '22023';
  end if;

  if t.last_location_at is null or t.last_location_at < now() - interval '4 seconds' then
    insert into officer_locations (task_id, officer_id, lat, lng, heading, speed, accuracy)
    values (p_task_id, auth.uid(), p_lat, p_lng, p_heading, p_speed, p_accuracy);
    update trip_tasks set last_lat = p_lat, last_lng = p_lng, last_heading = p_heading, last_location_at = now() where id = p_task_id;
  end if;

  return jsonb_build_object('sharing', true, 'eta_due', t.eta_updated_at is null or t.eta_updated_at < now() - interval '30 seconds');
end;
$$;
revoke all on function public.officer_share_location(uuid, double precision, double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.officer_share_location(uuid, double precision, double precision, double precision, double precision, double precision) to authenticated;

create or replace function public.officer_set_location_sharing(p_task_id uuid, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t trip_tasks%rowtype;
begin
  select * into t from trip_tasks where id = p_task_id;
  if not found or t.officer_id is distinct from auth.uid() or not is_fleet_officer() then
    raise exception 'This trip is not assigned to you.' using errcode = '42501';
  end if;
  if p_on and t.status <> 'en_route' then
    raise exception 'Location is only shared while you are on the way.' using errcode = 'P0001';
  end if;
  update trip_tasks set sharing_stopped_at = case when p_on then null else now() end where id = p_task_id;
  insert into trip_events (trip_task_id, actor_id, event)
  values (p_task_id, auth.uid(), case when p_on then 'location_sharing_on' else 'location_sharing_off' end);
  return p_on;
end;
$$;
revoke all on function public.officer_set_location_sharing(uuid, boolean) from public, anon;
grant execute on function public.officer_set_location_sharing(uuid, boolean) to authenticated;

-- ---- renter: the live trip for their booking (by booking id or by the booking chat's id) -----------------------------------------------

create or replace function public.renter_trip_live(p_booking_id uuid default null, p_conversation_id uuid default null)
returns table (
  task_id uuid, booking_id uuid, type text, status text, officer_name text, officer_photo text, vehicle_note text,
  officer_lat double precision, officer_lng double precision, officer_heading double precision, location_at timestamptz,
  dest_lat double precision, dest_lng double precision, destination text,
  eta_seconds integer, eta_distance_m integer, eta_source text, eta_updated_at timestamptz, route_polyline text,
  sharing boolean, conversation_id uuid
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_booking uuid := p_booking_id;
begin
  if v_booking is null and p_conversation_id is not null then
    select c.booking_id into v_booking from conversations c where c.id = p_conversation_id;
  end if;
  if v_booking is null or not exists (select 1 from bookings where id = v_booking and renter_id = auth.uid()) then
    return;
  end if;
  return query
    select t.id, t.booking_id, t.type, t.status, o.display_name, o.photo_url, o.vehicle_note,
           t.last_lat, t.last_lng, t.last_heading, t.last_location_at,
           t.dest_lat, t.dest_lng, case when t.type = 'delivery' then t.to_address else t.from_address end,
           t.eta_seconds, t.eta_distance_m, t.eta_source, t.eta_updated_at, t.route_polyline,
           (t.status = 'en_route' and t.sharing_stopped_at is null),
           (select c.id from conversations c where c.booking_id = t.booking_id)
    from trip_tasks t
    left join officer_profiles o on o.user_id = t.officer_id
    where t.booking_id = v_booking and t.status in ('en_route', 'arrived')
    order by t.scheduled_at nulls last;
end;
$$;
revoke all on function public.renter_trip_live(uuid, uuid) from public, anon;
grant execute on function public.renter_trip_live(uuid, uuid) to authenticated;

-- ---- officer: the live state of their own trip (map, ETA, sharing) ----------------------------------------------------------------------

create or replace function public.officer_trip_live(p_task_id uuid)
returns table (
  task_id uuid, status text, officer_lat double precision, officer_lng double precision, location_at timestamptz,
  dest_lat double precision, dest_lng double precision, eta_seconds integer, eta_distance_m integer, eta_source text,
  eta_updated_at timestamptz, route_polyline text, sharing boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.id, t.status, t.last_lat, t.last_lng, t.last_location_at, t.dest_lat, t.dest_lng, t.eta_seconds, t.eta_distance_m,
         t.eta_source, t.eta_updated_at, t.route_polyline, (t.status = 'en_route' and t.sharing_stopped_at is null)
  from trip_tasks t
  where t.id = p_task_id and t.officer_id = auth.uid() and is_fleet_officer();
$$;
revoke all on function public.officer_trip_live(uuid) from public, anon;
grant execute on function public.officer_trip_live(uuid) to authenticated;

-- ---- ETA storage (called by the fleet-trip-eta Edge Function with the service role) ------------------------------------------------------

create or replace function public.fo_save_trip_eta(
  p_task_id uuid, p_eta_seconds integer, p_distance_m integer, p_source text, p_polyline text,
  p_dest_lat double precision, p_dest_lng double precision
)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update trip_tasks set
    eta_seconds = p_eta_seconds,
    eta_distance_m = p_distance_m,
    eta_source = p_source,
    eta_updated_at = now(),
    route_polyline = coalesce(p_polyline, route_polyline),
    dest_lat = coalesce(p_dest_lat, dest_lat),
    dest_lng = coalesce(p_dest_lng, dest_lng)
  where id = p_task_id;
$$;
revoke all on function public.fo_save_trip_eta(uuid, integer, integer, text, text, double precision, double precision) from public, anon, authenticated;

-- ---- retention: location fixes are kept 30 days -------------------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'fleet-officer-locations-retention';
    perform cron.schedule('fleet-officer-locations-retention', '17 3 * * *',
      $job$delete from public.officer_locations where recorded_at < now() - interval '30 days'$job$);
  end if;
end $$;

-- ---- officer_advance_trip_task: same rules as 0189; pushes open the live map; sharing follows the status --------------------------------

create or replace function public.officer_advance_trip_task(p_task_id uuid, p_status text)
returns public.trip_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t trip_tasks%rowtype;
  v_renter uuid;
  v_name text;
  v_ok boolean;
begin
  select * into t from trip_tasks where id = p_task_id for update;
  if not found or t.officer_id is distinct from auth.uid() or not is_fleet_officer() then
    raise exception 'This trip is not assigned to you.' using errcode = '42501';
  end if;

  v_ok := (t.status, p_status) in (
    ('accepted', 'en_route'), ('en_route', 'arrived'), ('arrived', 'inspecting'), ('arrived', 'completed'), ('inspecting', 'completed')
  );
  if not v_ok then
    raise exception 'A trip that is % cannot move to %.', t.status, p_status using errcode = 'P0001';
  end if;

  update trip_tasks set
    status = p_status,
    started_at = case when p_status = 'en_route' then now() else started_at end,
    arrived_at = case when p_status = 'arrived' then now() else arrived_at end,
    completed_at = case when p_status = 'completed' then now() else completed_at end,
    -- Starting the trip (re)starts live location sharing; any later step ends it.
    sharing_stopped_at = case when p_status = 'en_route' then null else coalesce(sharing_stopped_at, now()) end
  where id = p_task_id
  returning * into t;

  if t.booking_id is not null then
    select renter_id into v_renter from bookings where id = t.booking_id;
  else
    execute 'select user_id from driver_bookings where id = $1' into v_renter using t.driver_booking_id;
  end if;
  v_name := fo_officer_name(auth.uid());
  if p_status = 'en_route' and v_renter is not null then
    perform fo_notify(array[v_renter], 'Your WopeCar officer is on the way',
      v_name || ' has started the ' || case t.type when 'delivery' then 'trip to deliver your car' else 'trip to collect the car' end || '.',
      case when t.booking_id is not null then '/live-trip/' || t.booking_id::text else '/(tabs)/bookings' end, t.booking_id);
  elsif p_status = 'arrived' and v_renter is not null then
    perform fo_notify(array[v_renter], 'Your WopeCar officer has arrived',
      v_name || ' is at ' || coalesce(case t.type when 'delivery' then t.to_address else t.from_address end, 'the meeting point') || '.',
      case when t.booking_id is not null then '/live-trip/' || t.booking_id::text else '/(tabs)/bookings' end, t.booking_id);
  end if;
  return t;
end;
$$;
revoke all on function public.officer_advance_trip_task(uuid, text) from public, anon;
grant execute on function public.officer_advance_trip_task(uuid, text) to authenticated;