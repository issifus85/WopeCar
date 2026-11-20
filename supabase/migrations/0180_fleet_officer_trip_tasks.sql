-- Fleet Officer, Phase 2: trip tasks, assignment, chat access, status flow, quick replies and notifications. PREPROD FIRST
-- (Wopecar-preprod). Needs 0179. Not for production until the Fleet Officer release gate passes.
--
-- What it does
--   * Every CONFIRMED rental booking (self-drive or chauffeur) gets two trip_tasks: a delivery (start of the rental, to the
--     pickup location) and a pickup / collection (end of the rental, from the return location). Kept in step when the booking's
--     dates, times or places change (until the officer has started), and cancelled when the booking is cancelled.
--     Where the WopeDriver tables exist (preprod), a CONFIRMED WopeDriver chauffeur request gets the same two tasks.
--   * Admin assigns / reassigns / unassigns with admin_assign_trip_task(). The officer is added to the booking's existing
--     support chat (same 'invited' participant the Ride Support invite uses) and removed again on reassignment. Assigning a
--     WopeDriver task also fills the request's assigned driver name / phone, which the customer already sees.
--   * The officer accepts / declines (officer_respond_trip_task) and moves the task forward ONLY in this order:
--     assigned -> accepted -> en_route -> arrived -> inspecting -> completed (officer_advance_trip_task; arrived -> completed is
--     allowed until Phase 3 wires the inspection in). Every change is logged in trip_events (0179 trigger).
--   * Quick replies ("On my way", "Running 10 min late", "I have arrived") post a chat message as the officer and log an event.
--   * Pushes (existing send-push-notification function, same internal_secrets pattern as 0148): officer on assignment,
--     reassignment away and cancellation; renter when the officer starts the trip and when they arrive; admins when an officer
--     declines or a task has not started 15 minutes after its scheduled time (cron, every 5 minutes).
--   * Chat: an active officer's messages show as "<name> · Fleet officer" (list_conversation_messages). Nothing else in chat
--     changes; chats without an officer behave exactly as before.

-- ---- extra columns -------------------------------------------------------------------------------------------------------------
alter table public.trip_tasks add column if not exists late_notified_at timestamptz;
alter table public.trip_tasks add column if not exists declined_at timestamptz;

-- ---- helpers -------------------------------------------------------------------------------------------------------------------
-- Booking times are free text ("10:00", "1:00 PM"). Ghana time (= UTC). Falls back to 09:00 when the time can't be read.
create or replace function public.fo_booking_ts(p_date date, p_time text)
returns timestamptz
language plpgsql
immutable
as $$
declare
  v_t text := upper(trim(coalesce(p_time, '')));
begin
  if p_date is null then
    return null;
  end if;
  begin
    if v_t ~ '^\d{1,2}(:\d{2})?\s*(AM|PM)$' then
      if v_t !~ ':' then
        v_t := regexp_replace(v_t, '^(\d{1,2})\s*', '\1:00 ');
      end if;
      return (to_timestamp(p_date::text || ' ' || v_t, 'YYYY-MM-DD HH12:MI AM')::timestamp) at time zone 'Africa/Accra';
    elsif v_t ~ '^\d{1,2}:\d{2}(:\d{2})?$' then
      return (p_date + v_t::time) at time zone 'Africa/Accra';
    end if;
  exception when others then
    null;
  end;
  return (p_date + time '09:00') at time zone 'Africa/Accra';
end;
$$;

-- Push + in-app notification to a set of users. Never raises: a notification problem must never undo the action that sent it.
create or replace function public.fo_notify(p_user_ids uuid[], p_title text, p_body text, p_url text, p_booking_id uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_base text; v_anon text; v_secret text; v_payload jsonb;
begin
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    return;
  end if;
  begin
    insert into notifications (user_id, type, title, body, booking_id)
    select distinct u, 'fleet_trip', p_title, p_body, p_booking_id from unnest(p_user_ids) u where u is not null;

    select value into v_base from internal_secrets where name = 'functions_base_url';
    select value into v_anon from internal_secrets where name = 'anon_key';
    select value into v_secret from internal_secrets where name = 'cron';
    if v_base is null or v_anon is null then
      return;
    end if;
    select jsonb_agg(jsonb_build_object('userId', u, 'title', p_title, 'body', p_body, 'data', jsonb_build_object('url', p_url)))
      into v_payload
      from (select distinct u from unnest(p_user_ids) u where u is not null) x;
    perform net.http_post(
      url := v_base || '/send-push-notification',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon, 'x-cron-secret', coalesce(v_secret, '')),
      body := jsonb_build_object('notifications', v_payload)
    );
  exception when others then
    null;
  end;
end;
$$;
revoke all on function public.fo_notify(uuid[], text, text, text, uuid) from public, anon, authenticated;

create or replace function public.fo_admin_ids()
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(id), '{}') from users where role = 'admin';
$$;
revoke all on function public.fo_admin_ids() from public, anon, authenticated;

create or replace function public.fo_officer_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select display_name from officer_profiles where user_id = p_user_id), 'Your WopeCar officer');
$$;
revoke all on function public.fo_officer_name(uuid) from public, anon, authenticated;

-- Adds / removes an officer to / from the booking's support chat. Removal only touches an 'invited' row and only when the officer
-- has no other open task on the same booking.
create or replace function public.fo_chat_add_officer(p_booking_id uuid, p_officer_id uuid, p_by uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_conversation uuid;
begin
  if p_booking_id is null or p_officer_id is null then
    return null;
  end if;
  select id into v_conversation from conversations where booking_id = p_booking_id;
  if v_conversation is null then
    return null;
  end if;
  insert into conversation_participants (conversation_id, user_id, role_in_conversation, invited_by_user_id)
  values (v_conversation, p_officer_id, 'invited', p_by)
  on conflict (conversation_id, user_id) do nothing;
  return v_conversation;
end;
$$;
revoke all on function public.fo_chat_add_officer(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.fo_chat_remove_officer(p_booking_id uuid, p_officer_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_booking_id is null or p_officer_id is null then
    return;
  end if;
  if exists (
    select 1 from trip_tasks
    where booking_id = p_booking_id and officer_id = p_officer_id and status not in ('completed', 'cancelled')
  ) then
    return;
  end if;
  delete from conversation_participants cp
  using conversations c
  where c.id = cp.conversation_id and c.booking_id = p_booking_id
    and cp.user_id = p_officer_id and cp.role_in_conversation = 'invited';
end;
$$;
revoke all on function public.fo_chat_remove_officer(uuid, uuid) from public, anon, authenticated;

-- ---- tasks from rental bookings ------------------------------------------------------------------------------------------------
create or replace function public.fo_sync_booking_tasks(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  b record;
  v_car_location text;
  t record;
begin
  select * into b from bookings where id = p_booking_id;
  if not found then
    return;
  end if;
  select location into v_car_location from cars where id = b.car_id;

  if b.status = 'confirmed' then
    insert into trip_tasks (booking_id, type, scheduled_at, from_address, to_address)
    values
      (b.id, 'delivery', fo_booking_ts(b.start_date, b.pickup_time), v_car_location, b.pickup_location),
      (b.id, 'pickup', fo_booking_ts(b.end_date, b.return_time), b.return_location, v_car_location)
    on conflict (booking_id, type) where booking_id is not null do nothing;

    -- Keep not-yet-started tasks in step with booking changes (a reopened cancelled task comes back unassigned).
    update trip_tasks tt set
      scheduled_at = case tt.type when 'delivery' then fo_booking_ts(b.start_date, b.pickup_time) else fo_booking_ts(b.end_date, b.return_time) end,
      from_address = case tt.type when 'delivery' then v_car_location else b.return_location end,
      to_address = case tt.type when 'delivery' then b.pickup_location else v_car_location end,
      late_notified_at = null,
      status = case when tt.status = 'cancelled' then 'unassigned' else tt.status end,
      officer_id = case when tt.status = 'cancelled' then null else tt.officer_id end,
      cancelled_at = null
    where tt.booking_id = b.id
      and tt.status in ('unassigned', 'assigned', 'accepted', 'cancelled')
      and (
        tt.status = 'cancelled'
        or tt.scheduled_at is distinct from case tt.type when 'delivery' then fo_booking_ts(b.start_date, b.pickup_time) else fo_booking_ts(b.end_date, b.return_time) end
        or tt.from_address is distinct from case tt.type when 'delivery' then v_car_location else b.return_location end
        or tt.to_address is distinct from case tt.type when 'delivery' then b.pickup_location else v_car_location end
      );
  elsif b.status = 'cancelled' then
    for t in
      update trip_tasks set status = 'cancelled', cancelled_at = now()
      where booking_id = b.id and status not in ('completed', 'cancelled')
      returning id, officer_id, type
    loop
      if t.officer_id is not null then
        perform fo_chat_remove_officer(b.id, t.officer_id);
        perform fo_notify(array[t.officer_id], 'Trip cancelled',
          'Booking ' || coalesce(b.booking_ref, '') || ' was cancelled, so your ' || case t.type when 'delivery' then 'delivery' else 'return pickup' end || ' is off.',
          '/officer', b.id);
      end if;
    end loop;
  end if;
end;
$$;
revoke all on function public.fo_sync_booking_tasks(uuid) from public, anon, authenticated;

create or replace function public.fo_bookings_sync_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  begin
    perform fo_sync_booking_tasks(new.id);
  exception when others then
    raise warning 'fo_sync_booking_tasks failed for booking %: %', new.id, sqlerrm; -- never block a booking write
  end;
  return new;
end;
$$;

drop trigger if exists bookings_fleet_trip_tasks on public.bookings;
create trigger bookings_fleet_trip_tasks
  after insert or update of status, start_date, end_date, pickup_time, return_time, pickup_location, return_location on public.bookings
  for each row execute function public.fo_bookings_sync_trigger();

-- Backfill: confirmed bookings that haven't ended yet.
do $$
declare r record;
begin
  for r in select id from bookings where status = 'confirmed' and end_date >= (now() at time zone 'Africa/Accra')::date loop
    perform fo_sync_booking_tasks(r.id);
  end loop;
end $$;

-- ---- tasks from WopeDriver chauffeur requests (only where the WopeDriver tables exist) -----------------------------------------
do $do$
begin
  if to_regclass('public.driver_bookings') is null then
    return;
  end if;

  execute $f$
    create or replace function public.fo_sync_driver_booking_tasks(p_driver_booking_id uuid)
    returns void
    language plpgsql
    security definer
    set search_path to 'public'
    as $body$
    declare
      d record; v_start timestamptz; v_end timestamptz; t record;
    begin
      select * into d from driver_bookings where id = p_driver_booking_id;
      if not found then return; end if;

      select (min(service_date + coalesce(start_time, time '09:00'))) at time zone 'Africa/Accra',
             (max(service_date + coalesce(start_time, time '09:00') + make_interval(mins => (coalesce(hours, 0) * 60)::int))) at time zone 'Africa/Accra'
        into v_start, v_end
        from driver_booking_days where driver_booking_id = d.id;
      v_start := coalesce(v_start, (d.first_service_date + time '09:00') at time zone 'Africa/Accra');
      v_end := coalesce(v_end, (d.last_service_date + time '18:00') at time zone 'Africa/Accra');

      if d.status = 'confirmed' then
        insert into trip_tasks (driver_booking_id, type, scheduled_at, from_address, to_address, notes)
        values
          (d.id, 'delivery', v_start, null, d.meeting_point, d.notes),
          (d.id, 'pickup', v_end, null, d.meeting_point, d.notes)
        on conflict (driver_booking_id, type) where driver_booking_id is not null do nothing;

        update trip_tasks tt set
          scheduled_at = case tt.type when 'delivery' then v_start else v_end end,
          to_address = d.meeting_point,
          notes = d.notes,
          status = case when tt.status = 'cancelled' then 'unassigned' else tt.status end,
          officer_id = case when tt.status = 'cancelled' then null else tt.officer_id end,
          cancelled_at = null,
          late_notified_at = null
        where tt.driver_booking_id = d.id and tt.status in ('unassigned', 'assigned', 'accepted', 'cancelled')
          and (tt.status = 'cancelled' or tt.scheduled_at is distinct from case tt.type when 'delivery' then v_start else v_end end
               or tt.to_address is distinct from d.meeting_point or tt.notes is distinct from d.notes);
      elsif d.status in ('cancelled', 'declined') then
        for t in
          update trip_tasks set status = 'cancelled', cancelled_at = now()
          where driver_booking_id = d.id and status not in ('completed', 'cancelled')
          returning id, officer_id
        loop
          if t.officer_id is not null then
            perform fo_notify(array[t.officer_id], 'Trip cancelled',
              'WopeDriver request ' || coalesce(d.booking_ref, '') || ' was cancelled, so this trip is off.', '/officer', null);
          end if;
        end loop;
      end if;
    end;
    $body$;
  $f$;
  execute 'revoke all on function public.fo_sync_driver_booking_tasks(uuid) from public, anon, authenticated';

  execute $f$
    create or replace function public.fo_driver_bookings_sync_trigger()
    returns trigger
    language plpgsql
    security definer
    set search_path to 'public'
    as $body$
    begin
      begin
        perform fo_sync_driver_booking_tasks(new.id);
      exception when others then
        raise warning 'fo_sync_driver_booking_tasks failed for %: %', new.id, sqlerrm;
      end;
      return new;
    end;
    $body$;
  $f$;

  execute 'drop trigger if exists driver_bookings_fleet_trip_tasks on public.driver_bookings';
  execute 'create trigger driver_bookings_fleet_trip_tasks
             after insert or update of status, meeting_point, first_service_date, last_service_date, notes on public.driver_bookings
             for each row execute function public.fo_driver_bookings_sync_trigger()';

  perform public.fo_sync_driver_booking_tasks(id) from public.driver_bookings where status = 'confirmed';
end
$do$;

-- ---- admin: assign / reassign / unassign ---------------------------------------------------------------------------------------
create or replace function public.admin_assign_trip_task(p_task_id uuid, p_officer_id uuid)
returns public.trip_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t trip_tasks%rowtype;
  v_old uuid;
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

  update trip_tasks set
    officer_id = p_officer_id,
    status = case when p_officer_id is null then 'unassigned' else 'assigned' end,
    assigned_by = case when p_officer_id is null then null else auth.uid() end,
    assigned_at = case when p_officer_id is null then null else now() end,
    started_at = null, arrived_at = null, declined_at = null, late_notified_at = null
  where id = p_task_id
  returning * into t; -- trip_tasks_check_officer (0179) refuses anyone who isn't an active officer

  if t.booking_id is not null then
    select booking_ref into v_ref from bookings where id = t.booking_id;
  else
    execute 'select booking_ref from driver_bookings where id = $1' into v_ref using t.driver_booking_id;
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
  return t;
end;
$$;
revoke all on function public.admin_assign_trip_task(uuid, uuid) from public, anon;
grant execute on function public.admin_assign_trip_task(uuid, uuid) to authenticated;

-- Admin: (re)create the tasks for a booking by hand, e.g. for a booking confirmed before this migration.
create or replace function public.admin_ensure_trip_tasks(p_booking_id uuid)
returns setof public.trip_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Only admins can manage trips' using errcode = '42501';
  end if;
  perform fo_sync_booking_tasks(p_booking_id);
  return query select * from trip_tasks where booking_id = p_booking_id order by type desc;
end;
$$;
revoke all on function public.admin_ensure_trip_tasks(uuid) from public, anon;
grant execute on function public.admin_ensure_trip_tasks(uuid) to authenticated;

-- Admin list of tasks (one booking, or a date window) with officer names. Admin has RLS on trip_tasks; this just joins names.
create or replace function public.admin_list_trip_tasks(p_booking_id uuid default null, p_from timestamptz default null, p_to timestamptz default null)
returns table (
  id uuid, booking_id uuid, driver_booking_id uuid, type text, status text, scheduled_at timestamptz,
  from_address text, to_address text, notes text, officer_id uuid, officer_name text, assigned_at timestamptz,
  started_at timestamptz, arrived_at timestamptz, completed_at timestamptz, booking_ref text, drive_type text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Only admins can manage trips' using errcode = '42501';
  end if;
  return query
    select t.id, t.booking_id, t.driver_booking_id, t.type, t.status, t.scheduled_at, t.from_address, t.to_address, t.notes,
           t.officer_id, o.display_name, t.assigned_at, t.started_at, t.arrived_at, t.completed_at,
           b.booking_ref, case when t.driver_booking_id is not null then 'WopeDriver' else b.drive_type end
    from trip_tasks t
    left join officer_profiles o on o.user_id = t.officer_id
    left join bookings b on b.id = t.booking_id
    where (p_booking_id is null or t.booking_id = p_booking_id)
      and (p_from is null or t.scheduled_at >= p_from)
      and (p_to is null or t.scheduled_at < p_to)
    order by t.scheduled_at nulls last, t.type desc;
end;
$$;
revoke all on function public.admin_list_trip_tasks(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_list_trip_tasks(uuid, timestamptz, timestamptz) to authenticated;

-- ---- officer: accept / decline, advance, quick replies -------------------------------------------------------------------------
create or replace function public.officer_respond_trip_task(p_task_id uuid, p_accept boolean)
returns public.trip_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t trip_tasks%rowtype;
  v_ref text;
begin
  select * into t from trip_tasks where id = p_task_id for update;
  if not found or t.officer_id is distinct from auth.uid() or not is_fleet_officer() then
    raise exception 'This trip is not assigned to you.' using errcode = '42501';
  end if;
  if t.status <> 'assigned' then
    raise exception 'This trip has already been %.', t.status using errcode = 'P0001';
  end if;

  if p_accept then
    update trip_tasks set status = 'accepted' where id = p_task_id returning * into t;
  else
    update trip_tasks set status = 'unassigned', officer_id = null, assigned_at = null, declined_at = now()
      where id = p_task_id returning * into t;
    insert into trip_events (trip_task_id, actor_id, event) values (p_task_id, auth.uid(), 'declined');
    perform fo_chat_remove_officer(t.booking_id, auth.uid());
    select booking_ref into v_ref from bookings where id = t.booking_id;
    perform fo_notify(fo_admin_ids(), 'Officer declined a trip',
      fo_officer_name(auth.uid()) || ' declined the ' || case t.type when 'delivery' then 'delivery' else 'return pickup' end
        || coalesce(' for ' || v_ref, '') || '. It needs a new officer.',
      case when t.booking_id is not null then '/admin/booking/' || t.booking_id::text else '/admin' end, t.booking_id);
  end if;
  return t;
end;
$$;
revoke all on function public.officer_respond_trip_task(uuid, boolean) from public, anon;
grant execute on function public.officer_respond_trip_task(uuid, boolean) to authenticated;

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
    completed_at = case when p_status = 'completed' then now() else completed_at end
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
      case when t.booking_id is not null then '/booking/' || t.booking_id::text else '/(tabs)/bookings' end, t.booking_id);
  elsif p_status = 'arrived' and v_renter is not null then
    perform fo_notify(array[v_renter], 'Your WopeCar officer has arrived',
      v_name || ' is at ' || coalesce(case t.type when 'delivery' then t.to_address else t.from_address end, 'the meeting point') || '.',
      case when t.booking_id is not null then '/booking/' || t.booking_id::text else '/(tabs)/bookings' end, t.booking_id);
  end if;
  return t;
end;
$$;
revoke all on function public.officer_advance_trip_task(uuid, text) from public, anon;
grant execute on function public.officer_advance_trip_task(uuid, text) to authenticated;

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

  select id into v_conversation from conversations where booking_id = t.booking_id;
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

-- ---- officer: my trips ---------------------------------------------------------------------------------------------------------
-- Everything the officer app shows, in one call. No cost / amount / payment column anywhere. Renter and vendor contact details
-- only while the task is open (same rule as officer_bookings).
create or replace function public.officer_trip_tasks(p_task_id uuid default null)
returns table (
  id uuid, type text, status text, scheduled_at timestamptz, from_address text, to_address text, notes text,
  assigned_at timestamptz, started_at timestamptz, arrived_at timestamptz, completed_at timestamptz,
  booking_id uuid, driver_booking_id uuid, booking_ref text, drive_type text, booking_status text,
  start_date date, end_date date, pickup_time text, return_time text,
  car_name text, car_image text, car_transmission text,
  customer_name text, customer_phone text, vendor_name text, vendor_phone text,
  conversation_id uuid
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not is_fleet_officer() then
    return;
  end if;
  return query
    select t.id, t.type, t.status, t.scheduled_at, t.from_address, t.to_address, t.notes,
           t.assigned_at, t.started_at, t.arrived_at, t.completed_at,
           t.booking_id, t.driver_booking_id, ob.booking_ref, ob.drive_type, ob.status,
           ob.start_date, ob.end_date, ob.pickup_time, ob.return_time,
           ob.car_name, ob.car_images[1], ob.car_transmission,
           case when t.status not in ('completed', 'cancelled') then ob.renter_name end,
           case when t.status not in ('completed', 'cancelled') then ob.renter_phone end,
           ob.vendor_name,
           case when t.status not in ('completed', 'cancelled') then ob.vendor_phone end,
           c.id
    from trip_tasks t
    left join officer_bookings ob on ob.id = t.booking_id
    left join conversations c on c.booking_id = t.booking_id
    where t.officer_id = auth.uid() and t.booking_id is not null and t.status <> 'cancelled'
      and (p_task_id is null or t.id = p_task_id)
    union all
    select x.* from officer_driver_trip_tasks(p_task_id) x
    order by 4 nulls last;
end;
$$;

-- WopeDriver half of officer_trip_tasks (a stub returning nothing where the WopeDriver tables don't exist).
do $do$
begin
  if to_regclass('public.driver_bookings') is not null then
    execute $f$
      create or replace function public.officer_driver_trip_tasks(p_task_id uuid)
      returns table (
        id uuid, type text, status text, scheduled_at timestamptz, from_address text, to_address text, notes text,
        assigned_at timestamptz, started_at timestamptz, arrived_at timestamptz, completed_at timestamptz,
        booking_id uuid, driver_booking_id uuid, booking_ref text, drive_type text, booking_status text,
        start_date date, end_date date, pickup_time text, return_time text,
        car_name text, car_image text, car_transmission text,
        customer_name text, customer_phone text, vendor_name text, vendor_phone text,
        conversation_id uuid
      )
      language sql
      stable
      security definer
      set search_path to 'public'
      as $body$
        select t.id, t.type, t.status, t.scheduled_at, t.from_address, t.to_address, t.notes,
               t.assigned_at, t.started_at, t.arrived_at, t.completed_at,
               null::uuid, t.driver_booking_id, d.booking_ref, 'WopeDriver'::text, d.status,
               d.first_service_date, d.last_service_date, null::text, null::text,
               d.car_description, null::text, d.car_transmission,
               case when t.status not in ('completed', 'cancelled') then d.contact_name end,
               case when t.status not in ('completed', 'cancelled') then d.contact_phone end,
               null::text, null::text, null::uuid
        from trip_tasks t
        join driver_bookings d on d.id = t.driver_booking_id
        where t.officer_id = auth.uid() and is_fleet_officer() and t.status <> 'cancelled'
          and (p_task_id is null or t.id = p_task_id);
      $body$;
    $f$;
  else
    execute $f$
      create or replace function public.officer_driver_trip_tasks(p_task_id uuid)
      returns table (
        id uuid, type text, status text, scheduled_at timestamptz, from_address text, to_address text, notes text,
        assigned_at timestamptz, started_at timestamptz, arrived_at timestamptz, completed_at timestamptz,
        booking_id uuid, driver_booking_id uuid, booking_ref text, drive_type text, booking_status text,
        start_date date, end_date date, pickup_time text, return_time text,
        car_name text, car_image text, car_transmission text,
        customer_name text, customer_phone text, vendor_name text, vendor_phone text,
        conversation_id uuid
      )
      language sql stable security definer set search_path to 'public'
      as $body$ select null::uuid, null::text, null::text, null::timestamptz, null::text, null::text, null::text,
        null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz, null::uuid, null::uuid, null::text, null::text,
        null::text, null::date, null::date, null::text, null::text, null::text, null::text, null::text, null::text, null::text,
        null::text, null::text, null::uuid where false $body$;
    $f$;
  end if;
  execute 'revoke all on function public.officer_driver_trip_tasks(uuid) from public, anon, authenticated';
end
$do$;

revoke all on function public.officer_trip_tasks(uuid) from public, anon;
grant execute on function public.officer_trip_tasks(uuid) to authenticated;

-- ---- renter: who is coming --------------------------------------------------------------------------------------------------
-- The renter sees only the officer's display name, photo and masked phone, only for their own booking's open tasks.
create or replace function public.renter_trip_officers(p_booking_id uuid)
returns table (task_id uuid, type text, status text, scheduled_at timestamptz, officer_name text, officer_photo text, officer_masked_phone text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.id, t.type, t.status, t.scheduled_at, o.display_name, o.photo_url, o.masked_phone
  from trip_tasks t
  join bookings b on b.id = t.booking_id and b.renter_id = auth.uid()
  join officer_profiles o on o.user_id = t.officer_id and o.is_active
  where t.booking_id = p_booking_id and t.status in ('assigned', 'accepted', 'en_route', 'arrived', 'inspecting')
  order by t.scheduled_at;
$$;
revoke all on function public.renter_trip_officers(uuid) from public, anon;
grant execute on function public.renter_trip_officers(uuid) to authenticated;

-- ---- late trips: admin push ----------------------------------------------------------------------------------------------------
create or replace function public.fo_flag_late_trip_tasks()
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record; n int := 0;
begin
  for r in
    update trip_tasks t set late_notified_at = now()
    where t.status in ('unassigned', 'assigned', 'accepted')
      and t.scheduled_at < now() - interval '15 minutes'
      and t.scheduled_at > now() - interval '1 day'
      and t.late_notified_at is null
    returning t.id, t.booking_id, t.type, t.status, t.officer_id
  loop
    n := n + 1;
    perform fo_notify(fo_admin_ids(),
      case when r.officer_id is null then 'Trip has no officer' else 'Trip not started' end,
      'The ' || case r.type when 'delivery' then 'delivery' else 'return pickup' end
        || coalesce(' for ' || (select booking_ref from bookings where id = r.booking_id), '')
        || case when r.officer_id is null then ' is 15 minutes past its time and has no officer.'
                else ' is 15 minutes past its time and ' || fo_officer_name(r.officer_id) || ' has not started it.' end,
      case when r.booking_id is not null then '/admin/booking/' || r.booking_id::text else '/admin' end, r.booking_id);
  end loop;
  return n;
end;
$$;
revoke all on function public.fo_flag_late_trip_tasks() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'fleet-late-trip-tasks';
    perform cron.schedule('fleet-late-trip-tasks', '*/5 * * * *', 'select public.fo_flag_late_trip_tasks()');
  end if;
end $$;

-- ---- chat: label an officer's messages -----------------------------------------------------------------------------------------
-- Identical to the live definition except sender_name: an active officer who is an invited participant of this chat shows as
-- "<officer display name> · Fleet officer". Everyone else's name is unchanged.
create or replace function public.list_conversation_messages(p_conversation_id uuid)
returns table(id uuid, conversation_id uuid, sender_id uuid, sender_name text, sender_is_support boolean, body text, attachment_type text, attachment_url text, attachment_meta jsonb, created_at timestamp with time zone, is_read boolean, read_at timestamp with time zone)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_can_view boolean;
begin
  select exists (
    select 1 from conversation_participants cp
    where cp.conversation_id = p_conversation_id and cp.user_id = auth.uid()
  ) or is_support() into v_can_view;

  if not v_can_view then
    raise exception 'Not authorized to view this conversation';
  end if;

  return query
    select
      m.id, m.conversation_id, m.sender_id,
      coalesce(
        (select o.display_name || ' · Fleet officer'
           from officer_profiles o
           join conversation_participants op on op.user_id = o.user_id and op.conversation_id = m.conversation_id and op.role_in_conversation = 'invited'
          where o.user_id = m.sender_id and o.is_active),
        u.full_name
      ),
      coalesce(u.is_support or u.role = 'admin', false),
      m.body, m.attachment_type, m.attachment_url, m.attachment_meta,
      m.created_at,
      exists (
        select 1 from conversation_participants cp
        where cp.conversation_id = p_conversation_id
          and cp.user_id <> m.sender_id
          and cp.last_read_at >= m.created_at
      ) as is_read,
      (
        select min(cp.last_read_at) from conversation_participants cp
        where cp.conversation_id = p_conversation_id
          and cp.user_id <> m.sender_id
          and cp.last_read_at >= m.created_at
      ) as read_at
    from conversation_messages m
    join users u on u.id = m.sender_id
    where m.conversation_id = p_conversation_id
    order by m.created_at asc;
end;
$function$;
