-- Fleet Officer Phase 6 - hardening (PREPROD ONLY until the release gate).
--
-- Edge cases and offline safety. Nothing here changes existing tables, roles or policies; it only redefines Fleet Officer functions
-- from 0189 / 0191. Safe to re-run.
--
--   * officer_advance_trip_task: repeating a step that already happened is a no-op (the offline queue can safely resend a tap), and an
--     officer can't start a second trip while another is still on the way.
--   * officer_quick_reply: the same quick reply within 2 minutes isn't posted twice (double tap / offline retry).
--   * officer_share_location: an officer whose trip was reassigned or cancelled is told to stop sharing instead of getting an error
--     on every fix.
--   * admin_assign_trip_task: reassigning or unassigning a trip that is under way clears the old officer's live position, ETA and
--     route, stops sharing, and tells the renter their officer changed.
--   * admin_set_fleet_officer_active: deactivating an officer hands back all their open trips, including one under way, the same way.

-- ---- officer_advance_trip_task --------------------------------------------------------------------------------------------------
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

  -- A retry of a step that already went through (the officer's phone was offline and sends the queued tap again) is a no-op: no
  -- error, no second push.
  if t.status = p_status then
    return t;
  end if;

  -- One live trip at a time: the phone shares one location, so a second trip can't start while another is still on the way.
  if p_status = 'en_route' then
    -- (WopeDriver trips have no booking here; driver_bookings isn't on every database, so it isn't joined.)
    select coalesce(b.booking_ref, 'another trip') into v_name
      from trip_tasks o left join bookings b on b.id = o.booking_id
     where o.officer_id = auth.uid() and o.id <> t.id and o.status = 'en_route'
     order by o.started_at desc nulls last limit 1;
    if found then
      raise exception 'You''re still on the way for %. Open that trip and tap I''ve arrived (or ask WopeCar to reassign it) before starting this one.', v_name
        using errcode = 'P0001';
    end if;
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

-- ---- officer_quick_reply --------------------------------------------------------------------------------------------------------
create or replace function public.officer_quick_reply(p_task_id uuid, p_kind text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t trip_tasks%rowtype;
  v_conversation uuid;
  v_body text;
  v_message conversation_messages;
begin
  select * into t from trip_tasks where id = p_task_id;
  if not found or t.officer_id is distinct from auth.uid() or not is_fleet_officer() or t.status in ('completed', 'cancelled') then
    raise exception 'This trip is not assigned to you.' using errcode = '42501';
  end if;
  v_body := case p_kind
    when 'on_my_way' then 'On my way'
    when 'running_late' then 'Running 10 min late'
    when 'arrived' then 'I have arrived'
  end;
  if v_body is null then
    raise exception 'Unknown quick reply.' using errcode = 'P0001';
  end if;

  -- The same quick reply sent again within 2 minutes (a double tap, or the offline queue retrying a send that did go through) is not
  -- posted twice: the earlier message is returned instead.
  select (e.payload ->> 'message_id')::uuid into v_message.id from trip_events e
   where e.trip_task_id = p_task_id and e.actor_id = auth.uid() and e.event = 'quick_reply' and e.payload ->> 'kind' = p_kind
     and e.created_at > now() - interval '2 minutes'
   order by e.created_at desc limit 1;
  if v_message.id is not null then
    return v_message.id;
  end if;

  select id into v_conversation from conversations where booking_id = t.booking_id order by created_at limit 1;
  if v_conversation is null then
    raise exception 'This trip has no chat.' using errcode = 'P0001';
  end if;
  -- Same path as typing it: the officer is an invited participant, so this is an ordinary message from them.
  v_message := send_conversation_message(v_conversation, v_body);
  insert into trip_events (trip_task_id, actor_id, event, payload)
  values (p_task_id, auth.uid(), 'quick_reply', jsonb_build_object('kind', p_kind, 'message_id', v_message.id));
  return v_message.id;
end;
$$;
revoke all on function public.officer_quick_reply(uuid, text) from public, anon;
grant execute on function public.officer_quick_reply(uuid, text) to authenticated;

-- ---- officer_share_location -----------------------------------------------------------------------------------------------------
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
  if not is_fleet_officer() then
    raise exception 'This trip is not assigned to you.' using errcode = '42501';
  end if;
  select * into t from trip_tasks where id = p_task_id;
  -- Reassigned to someone else, removed, or no longer on the way: just tell the phone to stop. Nothing about the trip is returned.
  if not found or t.officer_id is distinct from auth.uid() or t.status <> 'en_route' or t.sharing_stopped_at is not null then
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

-- ---- admin_assign_trip_task -----------------------------------------------------------------------------------------------------
create or replace function public.admin_assign_trip_task(p_task_id uuid, p_officer_id uuid)
returns public.trip_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t trip_tasks%rowtype;
  v_old uuid;
  v_was_live boolean;
  v_renter uuid;
  v_ref text;
  v_label text;
  v_when text;
begin
  if not is_admin() then
    raise exception 'Only admins can assign fleet officers' using errcode = '42501';
  end if;
  select * into t from trip_tasks where id = p_task_id for update;
  if not found then
    raise exception 'Trip not found.' using errcode = 'P0001';
  end if;
  if t.status in ('completed', 'cancelled') then
    raise exception 'This trip is % and can no longer be assigned.', t.status using errcode = 'P0001';
  end if;
  if p_officer_id is not distinct from t.officer_id then
    return t;
  end if;
  v_old := t.officer_id;
  v_was_live := t.status in ('en_route', 'arrived', 'inspecting');

  update trip_tasks set
    officer_id = p_officer_id,
    status = case when p_officer_id is null then 'unassigned' else 'assigned' end,
    assigned_by = case when p_officer_id is null then null else auth.uid() end,
    assigned_at = case when p_officer_id is null then null else now() end,
    started_at = null, arrived_at = null, declined_at = null, late_notified_at = null,
    -- The old officer's position, ETA and route must not show as the new officer's.
    last_lat = null, last_lng = null, last_heading = null, last_location_at = null,
    eta_seconds = null, eta_distance_m = null, eta_source = null, eta_updated_at = null, route_polyline = null,
    sharing_stopped_at = case when v_was_live then now() else sharing_stopped_at end
  where id = p_task_id
  returning * into t; -- trip_tasks_check_officer (0188) refuses anyone who isn't an active officer

  if t.booking_id is not null then
    select booking_ref, renter_id into v_ref, v_renter from bookings where id = t.booking_id;
  else
    execute 'select booking_ref, user_id from driver_bookings where id = $1' into v_ref, v_renter using t.driver_booking_id;
    execute 'update driver_bookings set assigned_driver_name = $2, assigned_driver_phone = $3 where id = $1'
      using t.driver_booking_id,
            (select display_name from officer_profiles where user_id = p_officer_id),
            (select phone from users where id = p_officer_id);
  end if;
  v_label := case t.type when 'delivery' then 'delivery' else 'return pickup' end;
  v_when := coalesce(to_char(t.scheduled_at at time zone 'Africa/Accra', 'Dy DD Mon, HH12:MI AM'), 'soon');

  if v_old is not null then
    perform fo_chat_remove_officer(t.booking_id, v_old);
    perform fo_notify(array[v_old], 'Trip reassigned',
      'Your ' || v_label || ' for ' || coalesce(v_ref, 'a booking') || ' was given to another officer.', '/officer', t.booking_id);
  end if;
  if p_officer_id is not null then
    perform fo_chat_add_officer(t.booking_id, p_officer_id, auth.uid());
    perform fo_notify(array[p_officer_id], 'New trip assigned',
      'You have a ' || v_label || ' for ' || coalesce(v_ref, 'a booking') || ' on ' || v_when || '. Tap to accept.',
      '/officer/task/' || t.id::text, t.booking_id);
  end if;
  -- The renter was watching the old officer come; tell them it changed.
  if v_was_live and v_renter is not null then
    perform fo_notify(array[v_renter], 'Your WopeCar officer has changed',
      case when p_officer_id is null
        then 'We are arranging a new officer for your ' || v_label || '. We will let you know when they are on the way.'
        else fo_officer_name(p_officer_id) || ' is now handling your ' || v_label || '. We will let you know when they are on the way.' end,
      case when t.booking_id is not null then '/booking/' || t.booking_id::text else '/(tabs)/bookings' end, t.booking_id);
  end if;
  insert into trip_events (trip_task_id, actor_id, event, payload)
  values (t.id, auth.uid(), case when p_officer_id is null then 'unassigned' else 'assigned' end,
          jsonb_build_object('from_officer', v_old, 'to_officer', p_officer_id, 'was_live', v_was_live));
  return t;
end;
$$;
revoke all on function public.admin_assign_trip_task(uuid, uuid) from public, anon;
grant execute on function public.admin_assign_trip_task(uuid, uuid) to authenticated;

-- ---- admin_set_fleet_officer_active ---------------------------------------------------------------------------------------------
-- Deactivating an officer now hands back every open trip, including one under way, through the same path as unassigning from
-- Dispatch: out of the chat, live position cleared, sharing stopped, renter told. (0188 only released trips not yet started, so a
-- renter could keep watching a deactivated officer's last position.)
create or replace function public.admin_set_fleet_officer_active(p_user_id uuid, p_active boolean)
returns public.officer_profiles
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row officer_profiles%rowtype;
  v_task uuid;
begin
  if not is_admin() then
    raise exception 'Only admins can manage fleet officers' using errcode = '42501';
  end if;
  update officer_profiles
     set is_active = p_active,
         deactivated_at = case when p_active then null else now() end,
         updated_at = now()
   where user_id = p_user_id
  returning * into v_row;
  if not found then
    raise exception 'That account is not a fleet officer.' using errcode = 'P0001';
  end if;

  if not p_active then
    for v_task in
      select id from trip_tasks where officer_id = p_user_id and status in ('assigned', 'accepted', 'en_route', 'arrived', 'inspecting')
    loop
      perform admin_assign_trip_task(v_task, null);
    end loop;
  end if;
  return v_row;
end;
$$;
revoke all on function public.admin_set_fleet_officer_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_fleet_officer_active(uuid, boolean) to authenticated;
