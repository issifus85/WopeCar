-- Fleet Officer, Phase 1: the officer user type, its security, and admin management. PREPROD FIRST (Wopecar-preprod) - not for
-- production until the Fleet Officer release gate passes.
--
-- A Fleet officer (driver) delivers and collects cars, chats with renters, and runs the existing inspection and rental agreement.
-- Being an officer is a separate, admin-granted marker: an active row in officer_profiles. users.role is NOT touched, so an officer
-- keeps exactly the renter / vendor / admin access they already had, and nobody else's access changes.
--
--   officer_profiles   one row per officer (admin-managed): what the renter sees + whether they can be assigned
--   trip_tasks         one row per delivery or collection leg (Phase 1: table + security only; Phase 2 creates tasks and the
--                      status flow). Needed now so "assigned trips only" can be enforced from day one.
--   trip_events        audit trail of assignments, status changes, tracking start/stop
--   officer_bookings   view: every booking field admin sees for the officer's assigned trips, minus every cost, amount, payment,
--                      payout and QuickBooks column. Renter contact details only while the task is still open.
--
-- Helpers: is_fleet_officer(), app_current_role() (current_role is a reserved word in Postgres), is_assigned_officer(task_id),
-- officer_assigned_to_booking(booking_id). Admin RPCs: admin_list_fleet_officers(), admin_upsert_fleet_officer(),
-- admin_set_fleet_officer_active().

-- ---- officer_profiles ----------------------------------------------------------------------------------------------------------
create table if not exists public.officer_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  display_name text not null,
  photo_url text,
  masked_phone text,
  vehicle_note text,
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deactivated_at timestamptz
);

alter table public.officer_profiles enable row level security;

drop policy if exists officer_profiles_admin_all on public.officer_profiles;
create policy officer_profiles_admin_all on public.officer_profiles for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists officer_profiles_self_select on public.officer_profiles;
create policy officer_profiles_self_select on public.officer_profiles for select to authenticated
  using (user_id = auth.uid());

revoke all on public.officer_profiles from anon;

-- ---- helpers -------------------------------------------------------------------------------------------------------------------
create or replace function public.is_fleet_officer()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from officer_profiles where user_id = auth.uid() and is_active);
$$;
revoke all on function public.is_fleet_officer() from public, anon;
grant execute on function public.is_fleet_officer() to authenticated;

-- The caller's highest role, for policies and the app: admin > fleet_officer > users.role (vendor / renter / suspended).
create or replace function public.app_current_role()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when u.role = 'admin' then 'admin'
    when u.role <> 'suspended' and exists (select 1 from officer_profiles o where o.user_id = u.id and o.is_active) then 'fleet_officer'
    else u.role
  end
  from users u where u.id = auth.uid();
$$;
revoke all on function public.app_current_role() from public, anon;
grant execute on function public.app_current_role() to authenticated;

-- ---- trip_tasks ----------------------------------------------------------------------------------------------------------------
-- One row per leg. A rental booking (self-drive or chauffeur) has booking_id; a WopeDriver chauffeur request has driver_booking_id
-- (its foreign key is added below only where the WopeDriver tables exist).
create table if not exists public.trip_tasks (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  driver_booking_id uuid,
  type text not null check (type in ('delivery', 'pickup')),
  officer_id uuid references public.users(id) on delete set null,
  status text not null default 'unassigned'
    check (status in ('unassigned', 'assigned', 'accepted', 'en_route', 'arrived', 'inspecting', 'completed', 'cancelled')),
  scheduled_at timestamptz,
  from_address text,
  to_address text,
  notes text,
  assigned_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz,
  started_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_tasks_one_source check ((booking_id is null) <> (driver_booking_id is null))
);

create unique index if not exists trip_tasks_booking_type_uidx on public.trip_tasks (booking_id, type) where booking_id is not null;
create unique index if not exists trip_tasks_driver_booking_type_uidx on public.trip_tasks (driver_booking_id, type) where driver_booking_id is not null;
create index if not exists trip_tasks_officer_idx on public.trip_tasks (officer_id, status);
create index if not exists trip_tasks_scheduled_idx on public.trip_tasks (scheduled_at);

do $$
begin
  if to_regclass('public.driver_bookings') is not null
     and not exists (select 1 from pg_constraint where conname = 'trip_tasks_driver_booking_fk') then
    alter table public.trip_tasks
      add constraint trip_tasks_driver_booking_fk foreign key (driver_booking_id) references public.driver_bookings(id) on delete cascade;
  end if;
end $$;

alter table public.trip_tasks enable row level security;

drop policy if exists trip_tasks_admin_all on public.trip_tasks;
create policy trip_tasks_admin_all on public.trip_tasks for all to authenticated
  using (is_admin()) with check (is_admin());

-- Officers read only their own tasks (writes come in Phase 2 through RPCs that enforce the status sequence).
drop policy if exists trip_tasks_officer_select on public.trip_tasks;
create policy trip_tasks_officer_select on public.trip_tasks for select to authenticated
  using (officer_id = auth.uid() and is_fleet_officer());

revoke all on public.trip_tasks from anon;

-- A task can only be assigned to an ACTIVE fleet officer.
create or replace function public.trip_tasks_check_officer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.officer_id is not null
     and (tg_op = 'INSERT' or new.officer_id is distinct from old.officer_id)
     and not exists (select 1 from officer_profiles where user_id = new.officer_id and is_active) then
    raise exception 'Tasks can only be assigned to an active fleet officer.' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trip_tasks_check_officer on public.trip_tasks;
create trigger trip_tasks_check_officer
  before insert or update on public.trip_tasks
  for each row execute function public.trip_tasks_check_officer();

create or replace function public.is_assigned_officer(p_trip_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from trip_tasks t
    join officer_profiles o on o.user_id = t.officer_id and o.is_active
    where t.id = p_trip_task_id and t.officer_id = auth.uid() and t.status <> 'cancelled'
  );
$$;
revoke all on function public.is_assigned_officer(uuid) from public, anon;
grant execute on function public.is_assigned_officer(uuid) to authenticated;

create or replace function public.officer_assigned_to_booking(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from trip_tasks t
    join officer_profiles o on o.user_id = t.officer_id and o.is_active
    where t.booking_id = p_booking_id and t.officer_id = auth.uid() and t.status <> 'cancelled'
  );
$$;
revoke all on function public.officer_assigned_to_booking(uuid) from public, anon;
grant execute on function public.officer_assigned_to_booking(uuid) to authenticated;

-- ---- trip_events ---------------------------------------------------------------------------------------------------------------
create table if not exists public.trip_events (
  id uuid primary key default gen_random_uuid(),
  trip_task_id uuid not null references public.trip_tasks(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  event text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists trip_events_task_idx on public.trip_events (trip_task_id, created_at);

alter table public.trip_events enable row level security;

drop policy if exists trip_events_admin_all on public.trip_events;
create policy trip_events_admin_all on public.trip_events for all to authenticated
  using (is_admin()) with check (is_admin());

-- Officers read the events of their own tasks. Nobody but admin writes directly; Phase 2 RPCs write events server-side.
drop policy if exists trip_events_officer_select on public.trip_events;
create policy trip_events_officer_select on public.trip_events for select to authenticated
  using (is_assigned_officer(trip_task_id));

revoke all on public.trip_events from anon;

-- Every assignment / reassignment / status change is logged automatically, whoever made it.
create or replace function public.trip_tasks_log_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    insert into trip_events (trip_task_id, actor_id, event, payload)
    values (new.id, auth.uid(), 'created', jsonb_build_object('status', new.status, 'officer_id', new.officer_id));
    return new;
  end if;
  if new.officer_id is distinct from old.officer_id then
    insert into trip_events (trip_task_id, actor_id, event, payload)
    values (new.id, auth.uid(), case when old.officer_id is null then 'assigned' when new.officer_id is null then 'unassigned' else 'reassigned' end,
            jsonb_build_object('from_officer_id', old.officer_id, 'to_officer_id', new.officer_id));
  end if;
  if new.status is distinct from old.status then
    insert into trip_events (trip_task_id, actor_id, event, payload)
    values (new.id, auth.uid(), 'status_changed', jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end;
$$;

drop trigger if exists trip_tasks_log_event on public.trip_tasks;
create trigger trip_tasks_log_event
  after insert or update on public.trip_tasks
  for each row execute function public.trip_tasks_log_event();

-- ---- what an officer may see of a booking --------------------------------------------------------------------------------------
-- Owner-privileged view (same pattern as vendor_bookings, 0153): reads bookings regardless of RLS and returns only bookings the
-- caller is the assigned, active officer for. No cost, amount, deposit, payment, payout, refund, promo, margin or QuickBooks
-- column is selected - by design, not by hiding. Renter contact details are returned only while at least one of the officer's
-- tasks on the booking is still open (not completed / cancelled).
create or replace view public.officer_bookings as
with mine as (
  select t.booking_id,
         bool_or(t.status not in ('completed', 'cancelled')) as has_open_task
  from public.trip_tasks t
  join public.officer_profiles o on o.user_id = t.officer_id and o.is_active
  where t.officer_id = auth.uid() and t.booking_id is not null and t.status <> 'cancelled'
  group by t.booking_id
)
select
  b.id, b.booking_ref, b.renter_id, b.car_id, b.vendor_id,
  b.start_date, b.end_date, b.pickup_time, b.return_time,
  b.pickup_location, b.return_location, b.drive_type,
  b.addon_names, b.addon_days, b.billable_days,
  b.with_driver, b.with_driver_days, b.wopecare_plan,
  b.status, b.vendor_accepted, b.booking_source, b.cancellation_reason,
  b.created_at, b.updated_at,
  c.name as car_name, c.make as car_make, c.model as car_model, c.year as car_year,
  c.transmission as car_transmission, c.images as car_images,
  case when m.has_open_task then u.full_name end as renter_name,
  case when m.has_open_task then u.phone end as renter_phone,
  case when m.has_open_task then u.email end as renter_email,
  v.business_name as vendor_name,
  case when m.has_open_task then vu.phone end as vendor_phone
from mine m
join public.bookings b on b.id = m.booking_id
left join public.cars c on c.id = b.car_id
left join public.users u on u.id = b.renter_id
left join public.vendors v on v.id = b.vendor_id
left join public.users vu on vu.id = v.user_id;

revoke all on public.officer_bookings from public, anon;
grant select on public.officer_bookings to authenticated;

-- ---- admin management ----------------------------------------------------------------------------------------------------------
create or replace function public.mask_phone(p_phone text)
returns text
language sql
immutable
as $$
  select case
    when p_phone is null or length(regexp_replace(p_phone, '\D', '', 'g')) < 7 then null
    else left(regexp_replace(p_phone, '\D', '', 'g'), 3) || ' *** ' || right(regexp_replace(p_phone, '\D', '', 'g'), 4)
  end;
$$;

create or replace function public.admin_list_fleet_officers()
returns table (
  user_id uuid, display_name text, photo_url text, masked_phone text, vehicle_note text, is_active boolean,
  email text, full_name text, phone text, user_role text, created_at timestamptz, deactivated_at timestamptz,
  open_tasks bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Only admins can manage fleet officers' using errcode = '42501';
  end if;
  return query
    select o.user_id, o.display_name, o.photo_url, o.masked_phone, o.vehicle_note, o.is_active,
           u.email, u.full_name, u.phone, u.role, o.created_at, o.deactivated_at,
           (select count(*) from trip_tasks t where t.officer_id = o.user_id and t.status not in ('completed', 'cancelled'))
    from officer_profiles o
    join users u on u.id = o.user_id
    order by o.is_active desc, o.display_name;
end;
$$;
revoke all on function public.admin_list_fleet_officers() from public, anon;
grant execute on function public.admin_list_fleet_officers() to authenticated;

-- Makes an EXISTING account an officer (or edits one). The account keeps its users.role; suspended accounts are refused.
create or replace function public.admin_upsert_fleet_officer(
  p_user_id uuid,
  p_display_name text default null,
  p_vehicle_note text default null,
  p_photo_url text default null
)
returns public.officer_profiles
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user users%rowtype;
  v_row officer_profiles%rowtype;
begin
  if not is_admin() then
    raise exception 'Only admins can manage fleet officers' using errcode = '42501';
  end if;
  select * into v_user from users where id = p_user_id;
  if not found then
    raise exception 'No account found for that user.' using errcode = 'P0001';
  end if;
  if v_user.role = 'suspended' then
    raise exception 'A suspended account cannot be made a fleet officer.' using errcode = 'P0001';
  end if;

  insert into officer_profiles (user_id, display_name, photo_url, masked_phone, vehicle_note, created_by)
  values (
    p_user_id,
    coalesce(nullif(trim(p_display_name), ''), nullif(trim(v_user.full_name), ''), split_part(v_user.email, '@', 1)),
    coalesce(nullif(trim(p_photo_url), ''), v_user.avatar_url),
    mask_phone(v_user.phone),
    nullif(trim(p_vehicle_note), ''),
    auth.uid()
  )
  on conflict (user_id) do update set
    display_name = coalesce(nullif(trim(p_display_name), ''), officer_profiles.display_name),
    photo_url = coalesce(nullif(trim(p_photo_url), ''), officer_profiles.photo_url, v_user.avatar_url),
    masked_phone = mask_phone(v_user.phone),
    vehicle_note = case when p_vehicle_note is null then officer_profiles.vehicle_note else nullif(trim(p_vehicle_note), '') end,
    updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.admin_upsert_fleet_officer(uuid, text, text, text) from public, anon;
grant execute on function public.admin_upsert_fleet_officer(uuid, text, text, text) to authenticated;

-- Deactivate / reactivate. Deactivating unassigns the officer's open tasks (they go back to "Needs officer").
create or replace function public.admin_set_fleet_officer_active(p_user_id uuid, p_active boolean)
returns public.officer_profiles
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row officer_profiles%rowtype;
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
    update trip_tasks
       set officer_id = null, status = 'unassigned', assigned_at = null
     where officer_id = p_user_id and status in ('assigned', 'accepted');
  end if;
  return v_row;
end;
$$;
revoke all on function public.admin_set_fleet_officer_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_fleet_officer_active(uuid, boolean) to authenticated;
