-- Fleet Officer Phase 5 - admin dispatch board (PREPROD ONLY until the release gate).
--
-- Adds, for admins only:
--   * admin_dispatch_board(from, to): every trip in the window (plus anything happening right now), with the car, renter, officer,
--     status, late flag, live position / ETA / route (Phase 4) and the handover paperwork status (Phase 3) - one call for the board.
--   * admin_officer_availability(day): each officer's availability today - Off (deactivated), On a trip, or Available - with their
--     current trip and last position, for the officer list and the active-officer map.
--   * admin_edit_handover_record(table, id, changes, reason): edits a submitted inspection or rental agreement. Only listed fields
--     can change, a reason is required, and the existing record_edits log (0190) records before / after / reason / who.
--   * trip_tasks joins the Realtime publication so the board updates within seconds of an officer status change. Realtime applies the
--     existing row-level rules, so admins see every trip, officers only their own and renters none.
--
-- Nothing here changes existing tables, roles or policies. Safe to re-run.

-- ---- live board updates ---------------------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_tasks') then
    alter publication supabase_realtime add table public.trip_tasks;
  end if;
end;
$$;

-- ---- the board ------------------------------------------------------------------------------------------------------------------
create or replace function public.admin_dispatch_board(p_from timestamptz, p_to timestamptz)
returns table (
  id uuid, booking_id uuid, driver_booking_id uuid, booking_ref text, type text, drive_type text, status text,
  scheduled_at timestamptz, from_address text, to_address text, notes text,
  officer_id uuid, officer_name text, officer_phone text,
  car_name text, renter_name text, renter_phone text, conversation_id uuid,
  assigned_at timestamptz, started_at timestamptz, arrived_at timestamptz, completed_at timestamptz,
  is_late boolean,
  last_lat double precision, last_lng double precision, last_location_at timestamptz,
  dest_lat double precision, dest_lng double precision, eta_seconds integer, eta_distance_m integer, route_polyline text, sharing boolean,
  pre_inspection_id uuid, pre_inspection_status text, post_inspection_id uuid, post_inspection_status text,
  agreement_id uuid, agreement_status text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Only admins can open the dispatch board' using errcode = '42501';
  end if;
  return query
    select t.id, t.booking_id, t.driver_booking_id, b.booking_ref, t.type,
           case when t.driver_booking_id is not null then 'WopeDriver' else b.drive_type end,
           t.status, t.scheduled_at, t.from_address, t.to_address, t.notes,
           t.officer_id, o.display_name, ou.phone,
           coalesce(nullif(trim(c.name), ''), nullif(trim(concat_ws(' ', c.make, c.model)), '')),
           ru.full_name, ru.phone, cv.id,
           t.assigned_at, t.started_at, t.arrived_at, t.completed_at,
           (t.status in ('unassigned', 'assigned', 'accepted') and t.scheduled_at < now() - interval '15 minutes'),
           t.last_lat, t.last_lng, t.last_location_at,
           t.dest_lat, t.dest_lng, t.eta_seconds, t.eta_distance_m, t.route_polyline,
           (t.status = 'en_route' and t.sharing_stopped_at is null),
           pre.id, pre.status, post.id, post.status, ra.id, ra.status
    from trip_tasks t
    left join officer_profiles o on o.user_id = t.officer_id
    left join users ou on ou.id = t.officer_id
    left join bookings b on b.id = t.booking_id
    left join cars c on c.id = b.car_id
    left join users ru on ru.id = b.renter_id
    left join lateral (select x.id from conversations x where x.booking_id = t.booking_id order by x.created_at limit 1) cv on true
    left join vehicle_inspections pre on pre.booking_id = t.booking_id and pre.type = 'pre'
    left join vehicle_inspections post on post.booking_id = t.booking_id and post.type = 'post'
    left join rental_agreements ra on ra.booking_id = t.booking_id
    where (t.scheduled_at >= p_from and t.scheduled_at < p_to)
       -- Happening right now, whatever day it was scheduled for.
       or t.status in ('en_route', 'arrived', 'inspecting')
       -- Still not started and already late (scheduled in the last day before the window).
       or (t.status in ('unassigned', 'assigned', 'accepted') and t.scheduled_at < p_from and t.scheduled_at >= p_from - interval '1 day'
           and t.scheduled_at < now() - interval '15 minutes')
    order by t.scheduled_at nulls last, t.type desc;
end;
$$;
revoke all on function public.admin_dispatch_board(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_dispatch_board(timestamptz, timestamptz) to authenticated;

-- ---- officer availability today -------------------------------------------------------------------------------------------------
create or replace function public.admin_officer_availability(p_day date default null)
returns table (
  user_id uuid, display_name text, photo_url text, phone text, vehicle_note text, is_active boolean,
  availability text,            -- 'off' | 'on_trip' | 'available'
  trips_today integer, next_trip_at timestamptz,
  current_task_id uuid, current_booking_ref text, current_status text,
  last_lat double precision, last_lng double precision, last_location_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Africa/Accra')::date);
  v_from timestamptz := v_day::timestamp at time zone 'Africa/Accra';
  v_to timestamptz := (v_day + 1)::timestamp at time zone 'Africa/Accra';
begin
  if not is_admin() then
    raise exception 'Only admins can see officer availability' using errcode = '42501';
  end if;
  return query
    select o.user_id, o.display_name, o.photo_url, u.phone, o.vehicle_note, o.is_active,
           case when not o.is_active then 'off' when cur.id is not null then 'on_trip' else 'available' end,
           (select count(*)::int from trip_tasks d where d.officer_id = o.user_id and d.status <> 'cancelled'
              and d.scheduled_at >= v_from and d.scheduled_at < v_to),
           (select min(n.scheduled_at) from trip_tasks n where n.officer_id = o.user_id
              and n.status in ('assigned', 'accepted') and n.scheduled_at >= now() - interval '1 day'),
           cur.id, b.booking_ref, cur.status, cur.last_lat, cur.last_lng, cur.last_location_at
    from officer_profiles o
    join users u on u.id = o.user_id
    left join lateral (
      select t.* from trip_tasks t where t.officer_id = o.user_id and t.status in ('en_route', 'arrived', 'inspecting')
      order by case t.status when 'en_route' then 0 when 'arrived' then 1 else 2 end, t.started_at desc nulls last limit 1
    ) cur on true
    left join bookings b on b.id = cur.booking_id
    order by o.is_active desc, (cur.id is null), o.display_name;
end;
$$;
revoke all on function public.admin_officer_availability(date) from public, anon;
grant execute on function public.admin_officer_availability(date) to authenticated;

-- ---- admin edits to a submitted inspection or agreement (logged) ---------------------------------------------------------------
create or replace function public.admin_edit_handover_record(p_table text, p_record_id uuid, p_changes jsonb, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_allowed text[];
  v_key text;
  v_sets text[] := '{}';
  v_row jsonb;
begin
  if not is_admin() then
    raise exception 'Only admins can edit a submitted record' using errcode = '42501';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then
    raise exception 'Please give a reason for the change.' using errcode = 'P0001';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    raise exception 'Nothing to change.' using errcode = 'P0001';
  end if;

  v_allowed := case p_table
    when 'vehicle_inspections' then array['mileage', 'mileage_unit', 'fuel_level']
    when 'rental_agreements' then array['lessee_name', 'vehicle_registration', 'vehicle_make', 'vehicle_color', 'vehicle_year',
                                        'pickup_time', 'return_time', 'ghana_only_use']
    else null end;
  if v_allowed is null then
    raise exception 'Only inspections and rental agreements can be edited here.' using errcode = 'P0001';
  end if;

  for v_key in select jsonb_object_keys(p_changes) loop
    if not v_key = any (v_allowed) then
      raise exception '"%" cannot be changed here.', v_key using errcode = 'P0001';
    end if;
    v_sets := v_sets || format('%I = (jsonb_populate_record(null::public.%I, $1)).%I', v_key, p_table, v_key);
  end loop;

  -- The record_edits trigger (0190) picks the reason up from here.
  perform set_config('app.edit_reason', trim(p_reason), true);
  execute format('update public.%I set %s where id = $2 returning to_jsonb(%I.*)', p_table, array_to_string(v_sets, ', '), p_table)
    into v_row using p_changes, p_record_id;
  perform set_config('app.edit_reason', '', true);

  if v_row is null then
    raise exception 'Record not found.' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;
revoke all on function public.admin_edit_handover_record(text, uuid, jsonb, text) from public, anon;
grant execute on function public.admin_edit_handover_record(text, uuid, jsonb, text) to authenticated;
