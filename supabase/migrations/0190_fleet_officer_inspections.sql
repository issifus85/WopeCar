-- Fleet Officer, Phase 3 (PREPROD ONLY until the release gate): the assigned officer runs the EXISTING pre-trip / post-trip inspection
-- and the client rental agreement exactly as an admin does today. The flow, the records and what the renter receives do not change.
--
-- Which trip covers what:
--   delivery trip      -> the pre-rental inspection ('pre') and the client rental agreement
--   return pickup trip -> the post-rental inspection ('post')
--
-- What this adds (nothing existing is removed or narrowed; every policy here is a NEW additional policy):
--   * initiated_by / initiated_by_role on vehicle_inspections and rental_agreements, set on creation; old rows backfilled.
--   * Officer policies: the assigned officer can create and update the inspection / agreement of their own open trip, and read the
--     records (plus the photo, signature and PDF files) of bookings they are assigned to. Nothing for other bookings.
--   * Locking is unchanged: the existing triggers (0157, 0162) already stop everyone except admin from changing a SUBMITTED inspection
--     or agreement, and an officer is not an admin. New: every admin change to a submitted record is written to record_edits
--     (before, after, who, when, reason).
--   * officer_start_rental_agreement(): the officer equivalent of the admin's "Start" (the draft is prefilled from the booking on the
--     server, because officers cannot read the bookings table - same values the admin's draft gets, including rate and deposit).
--   * Trip status follows the paperwork: starting the inspection / agreement moves the trip to Inspecting; when everything that trip
--     covers is submitted the trip is Completed.
-- Safe to run more than once.

-- ---- who started it ---------------------------------------------------------------------------------------------------------------

alter table public.vehicle_inspections add column if not exists initiated_by uuid default auth.uid();
alter table public.vehicle_inspections add column if not exists initiated_by_role text;
alter table public.rental_agreements add column if not exists initiated_by_role text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vehicle_inspections_initiated_by_role_check') then
    alter table public.vehicle_inspections add constraint vehicle_inspections_initiated_by_role_check
      check (initiated_by_role is null or initiated_by_role in ('admin', 'fleet_officer', 'renter', 'vendor', 'system'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rental_agreements_initiated_by_role_check') then
    alter table public.rental_agreements add constraint rental_agreements_initiated_by_role_check
      check (initiated_by_role is null or initiated_by_role in ('admin', 'fleet_officer', 'renter', 'vendor', 'system'));
  end if;
end $$;

-- Backfill: an agreement whose creator is known gets that person's role; everything else is recorded as admin (the spec's rule).
update public.rental_agreements ra
   set initiated_by_role = case
         when exists (select 1 from public.users u where u.id = ra.initiated_by and u.role = 'admin') then 'admin'
         when exists (select 1 from public.bookings b where b.id = ra.booking_id and b.renter_id = ra.initiated_by) then 'renter'
         else 'admin'
       end
 where ra.initiated_by_role is null;
update public.rental_agreements set initiated_by_role = 'admin' where initiated_by_role is null;
update public.vehicle_inspections set initiated_by_role = 'admin' where initiated_by_role is null;

-- ---- officer helpers ---------------------------------------------------------------------------------------------------------------

-- The caller's open trip that covers this paperwork, if any. p_kind: 'pre' | 'post' | 'agreement'. Open = accepted onwards, not finished.
create or replace function public.fo_officer_task_for(p_booking_id uuid, p_kind text)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.id
  from trip_tasks t
  join officer_profiles o on o.user_id = t.officer_id and o.is_active
  where t.booking_id = p_booking_id
    and t.officer_id = auth.uid()
    and t.type = case when p_kind = 'post' then 'pickup' else 'delivery' end
    and t.status in ('accepted', 'en_route', 'arrived', 'inspecting')
  order by t.scheduled_at nulls last
  limit 1;
$$;
revoke all on function public.fo_officer_task_for(uuid, text) from public, anon;
grant execute on function public.fo_officer_task_for(uuid, text) to authenticated;

create or replace function public.fo_officer_can_write(p_booking_id uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select fo_officer_task_for(p_booking_id, p_kind) is not null;
$$;
revoke all on function public.fo_officer_can_write(uuid, text) from public, anon;
grant execute on function public.fo_officer_can_write(uuid, text) to authenticated;

-- Child rows (photos, damage marks) carry only the inspection id.
create or replace function public.fo_officer_can_write_inspection(p_inspection_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from vehicle_inspections vi where vi.id = p_inspection_id and fo_officer_can_write(vi.booking_id, vi.type)
  );
$$;
revoke all on function public.fo_officer_can_write_inspection(uuid) from public, anon;
grant execute on function public.fo_officer_can_write_inspection(uuid) to authenticated;

create or replace function public.fo_officer_can_view_inspection(p_inspection_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from vehicle_inspections vi where vi.id = p_inspection_id and officer_assigned_to_booking(vi.booking_id)
  );
$$;
revoke all on function public.fo_officer_can_view_inspection(uuid) from public, anon;
grant execute on function public.fo_officer_can_view_inspection(uuid) to authenticated;

-- ---- set initiated_by / initiated_by_role on creation ------------------------------------------------------------------------------

create or replace function public.fo_set_initiated_by()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_kind text := case when tg_table_name = 'rental_agreements' then 'agreement' else to_jsonb(new) ->> 'type' end;
begin
  new.initiated_by := coalesce(new.initiated_by, v_uid);
  if new.initiated_by_role is null then
    new.initiated_by_role := case
      when v_uid is null then 'system'
      when exists (select 1 from users where id = v_uid and role = 'admin') then 'admin'
      when fo_officer_can_write(new.booking_id, v_kind) then 'fleet_officer'
      when exists (select 1 from bookings where id = new.booking_id and renter_id = v_uid) then 'renter'
      when exists (select 1 from bookings b where b.id = new.booking_id and is_vendor_owner(b.vendor_id)) then 'vendor'
      else null
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists vehicle_inspections_set_initiated_by on public.vehicle_inspections;
create trigger vehicle_inspections_set_initiated_by before insert on public.vehicle_inspections
  for each row execute function public.fo_set_initiated_by();
drop trigger if exists rental_agreements_set_initiated_by on public.rental_agreements;
create trigger rental_agreements_set_initiated_by before insert on public.rental_agreements
  for each row execute function public.fo_set_initiated_by();

-- ---- officer policies (additional; existing renter / vendor / admin policies are untouched) ----------------------------------------

drop policy if exists vehicle_inspections_officer_select on public.vehicle_inspections;
create policy vehicle_inspections_officer_select on public.vehicle_inspections for select to authenticated
  using (officer_assigned_to_booking(booking_id));
drop policy if exists vehicle_inspections_officer_insert on public.vehicle_inspections;
create policy vehicle_inspections_officer_insert on public.vehicle_inspections for insert to authenticated
  with check (fo_officer_can_write(booking_id, type));
drop policy if exists vehicle_inspections_officer_update on public.vehicle_inspections;
create policy vehicle_inspections_officer_update on public.vehicle_inspections for update to authenticated
  using (fo_officer_can_write(booking_id, type)) with check (fo_officer_can_write(booking_id, type));

drop policy if exists vehicle_inspection_photos_officer_select on public.vehicle_inspection_photos;
create policy vehicle_inspection_photos_officer_select on public.vehicle_inspection_photos for select to authenticated
  using (fo_officer_can_view_inspection(inspection_id));
drop policy if exists vehicle_inspection_photos_officer_insert on public.vehicle_inspection_photos;
create policy vehicle_inspection_photos_officer_insert on public.vehicle_inspection_photos for insert to authenticated
  with check (fo_officer_can_write_inspection(inspection_id));
drop policy if exists vehicle_inspection_photos_officer_update on public.vehicle_inspection_photos;
create policy vehicle_inspection_photos_officer_update on public.vehicle_inspection_photos for update to authenticated
  using (fo_officer_can_write_inspection(inspection_id)) with check (fo_officer_can_write_inspection(inspection_id));

drop policy if exists vehicle_inspection_damage_points_officer_select on public.vehicle_inspection_damage_points;
create policy vehicle_inspection_damage_points_officer_select on public.vehicle_inspection_damage_points for select to authenticated
  using (fo_officer_can_view_inspection(inspection_id));
drop policy if exists vehicle_inspection_damage_points_officer_insert on public.vehicle_inspection_damage_points;
create policy vehicle_inspection_damage_points_officer_insert on public.vehicle_inspection_damage_points for insert to authenticated
  with check (fo_officer_can_write_inspection(inspection_id));
drop policy if exists vehicle_inspection_damage_points_officer_delete on public.vehicle_inspection_damage_points;
create policy vehicle_inspection_damage_points_officer_delete on public.vehicle_inspection_damage_points for delete to authenticated
  using (fo_officer_can_write_inspection(inspection_id));

drop policy if exists rental_agreements_officer_select on public.rental_agreements;
create policy rental_agreements_officer_select on public.rental_agreements for select to authenticated
  using (officer_assigned_to_booking(booking_id));
drop policy if exists rental_agreements_officer_insert on public.rental_agreements;
create policy rental_agreements_officer_insert on public.rental_agreements for insert to authenticated
  with check (fo_officer_can_write(booking_id, 'agreement'));
drop policy if exists rental_agreements_officer_update on public.rental_agreements;
create policy rental_agreements_officer_update on public.rental_agreements for update to authenticated
  using (fo_officer_can_write(booking_id, 'agreement')) with check (fo_officer_can_write(booking_id, 'agreement'));

-- Files: photos and signatures live under <uploader uid>/inspections/<inspection id>/... and <uploader uid>/agreements/<agreement id>/...,
-- PDF copies under inspections/<booking id>/<type>/... (0071) and system/agreements/<agreement id>/... (0162). The officer uploads into
-- their own folder through the existing documents_owner_* policies; these let them open the other party's files for their bookings.
drop policy if exists documents_officer_inspection_select on storage.objects;
create policy documents_officer_inspection_select on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[2] = 'inspections'
    and exists (
      select 1 from public.vehicle_inspections vi
      where vi.id::text = (storage.foldername(name))[3] and public.officer_assigned_to_booking(vi.booking_id)
    )
  );
drop policy if exists documents_officer_inspection_report_select on storage.objects;
create policy documents_officer_inspection_report_select on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'inspections'
    and exists (
      select 1 from public.vehicle_inspections vi
      where vi.booking_id::text = (storage.foldername(name))[2] and public.officer_assigned_to_booking(vi.booking_id)
    )
  );
drop policy if exists documents_officer_agreement_select on storage.objects;
create policy documents_officer_agreement_select on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[2] = 'agreements'
    and exists (
      select 1 from public.rental_agreements ra
      where ra.id::text = (storage.foldername(name))[3] and public.officer_assigned_to_booking(ra.booking_id)
    )
  );

-- ---- officer "Start" for the rental agreement ----------------------------------------------------------------------------------------

-- Same prefill as the admin's startRentalAgreementForBooking (services/rentalAgreementApi.js): lessee, car, daily rate, deposit, dates and
-- times from the booking. Returns the existing agreement when there is one (started by the renter, an admin or earlier by the officer).
create or replace function public.officer_start_rental_agreement(p_booking_id uuid)
returns public.rental_agreements
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row rental_agreements;
begin
  select * into v_row from rental_agreements where booking_id = p_booking_id;
  if found then
    if not officer_assigned_to_booking(p_booking_id) then
      raise exception 'This booking is not assigned to you.' using errcode = '42501';
    end if;
    return v_row;
  end if;
  if not fo_officer_can_write(p_booking_id, 'agreement') then
    raise exception 'Only the officer on this booking''s open delivery can start its rental agreement.' using errcode = '42501';
  end if;

  insert into rental_agreements (
    booking_id, status, lessee_name, vehicle_make, daily_rate, security_deposit, duration_start, duration_end, pickup_time,
    return_time, ghana_only_use, initiated_by, initiated_by_role
  )
  select b.id, 'draft', u.full_name, nullif(concat_ws(' ', c.make, c.model), ''), c.price_per_day, b.security_deposit,
         b.start_date::date, b.end_date::date, nullif(b.pickup_time, ''), nullif(b.return_time, ''), true, auth.uid(), 'fleet_officer'
  from bookings b
  left join cars c on c.id = b.car_id
  left join users u on u.id = b.renter_id
  where b.id = p_booking_id
  on conflict (booking_id) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from rental_agreements where booking_id = p_booking_id;
  end if;
  return v_row;
end;
$$;
revoke all on function public.officer_start_rental_agreement(uuid) from public, anon;
grant execute on function public.officer_start_rental_agreement(uuid) to authenticated;

-- ---- trip status follows the paperwork -------------------------------------------------------------------------------------------------

-- Is everything the trip covers submitted? Delivery: pre-rental inspection AND rental agreement. Return pickup: post-rental inspection.
create or replace function public.fo_trip_paperwork_done(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case t.type
    when 'delivery' then
      exists (select 1 from vehicle_inspections where booking_id = t.booking_id and type = 'pre' and status = 'submitted')
      and exists (select 1 from rental_agreements where booking_id = t.booking_id and status = 'submitted')
    else
      exists (select 1 from vehicle_inspections where booking_id = t.booking_id and type = 'post' and status = 'submitted')
  end
  from trip_tasks t where t.id = p_task_id and t.booking_id is not null;
$$;
revoke all on function public.fo_trip_paperwork_done(uuid) from public, anon;

create or replace function public.fo_paperwork_trip_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_kind text := case when tg_table_name = 'rental_agreements' then 'agreement' else to_jsonb(new) ->> 'type' end;
  v_task uuid;
  r record;
begin
  begin
    -- The officer starting / saving the paperwork of their trip: the trip is now Inspecting.
    v_task := fo_officer_task_for(new.booking_id, v_kind);
    if v_task is not null then
      update trip_tasks set
        status = 'inspecting',
        started_at = coalesce(started_at, now()),
        arrived_at = coalesce(arrived_at, now())
      where id = v_task and status in ('accepted', 'en_route', 'arrived');
    end if;

    -- Just submitted (by anyone - officer, admin or renter): a trip whose paperwork is now all done is Completed.
    if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
      for r in
        select id from trip_tasks
        where booking_id = new.booking_id
          and type = case when v_kind = 'post' then 'pickup' else 'delivery' end
          and status in ('arrived', 'inspecting')
      loop
        if fo_trip_paperwork_done(r.id) then
          update trip_tasks set status = 'completed', completed_at = now() where id = r.id;
        end if;
      end loop;
    end if;
  exception when others then
    -- Never block an inspection or agreement save because of trip bookkeeping.
    raise warning 'fo_paperwork_trip_status: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists vehicle_inspections_fleet_trip_status on public.vehicle_inspections;
create trigger vehicle_inspections_fleet_trip_status after insert or update on public.vehicle_inspections
  for each row execute function public.fo_paperwork_trip_status();
drop trigger if exists rental_agreements_fleet_trip_status on public.rental_agreements;
create trigger rental_agreements_fleet_trip_status after insert or update on public.rental_agreements
  for each row execute function public.fo_paperwork_trip_status();

-- ---- record_edits: every admin change to a submitted inspection or agreement ----------------------------------------------------------

create table if not exists public.record_edits (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  booking_id uuid,
  action text not null,
  edited_by uuid default auth.uid(),
  reason text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index if not exists record_edits_record_idx on public.record_edits (table_name, record_id, created_at desc);
alter table public.record_edits enable row level security;
drop policy if exists record_edits_admin_select on public.record_edits;
create policy record_edits_admin_select on public.record_edits for select to authenticated using (is_admin());
-- No insert / update / delete policies: rows are only written by the trigger below and can never be changed from the app.

-- Reason: an admin edit screen (Phase 5) sets it for the transaction with  select set_config('app.edit_reason', '...', true).
create or replace function public.fo_log_record_edit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_parent_status text;
  v_record uuid;
  v_booking uuid;
  v_before jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_after jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  -- Only real signed-in callers; the PDF functions (service role) setting report_pdf_path are bookkeeping, not edits.
  if auth.uid() is null then
    return null;
  end if;

  if tg_table_name in ('vehicle_inspections', 'rental_agreements') then
    v_parent_status := old.status;
    v_record := old.id;
    v_booking := old.booking_id;
    if (v_before - 'updated_at') = (v_after - 'updated_at') then
      return null;
    end if;
  else
    v_record := coalesce(new.inspection_id, old.inspection_id);
    select status, booking_id into v_parent_status, v_booking from vehicle_inspections where id = v_record;
  end if;

  if v_parent_status = 'submitted' then
    insert into record_edits (table_name, record_id, booking_id, action, edited_by, reason, before, after)
    values (tg_table_name, v_record, v_booking, lower(tg_op), auth.uid(), nullif(current_setting('app.edit_reason', true), ''), v_before, v_after);
  end if;
  return null;
end;
$$;

drop trigger if exists vehicle_inspections_log_edits on public.vehicle_inspections;
create trigger vehicle_inspections_log_edits after update on public.vehicle_inspections
  for each row execute function public.fo_log_record_edit();
drop trigger if exists rental_agreements_log_edits on public.rental_agreements;
create trigger rental_agreements_log_edits after update on public.rental_agreements
  for each row execute function public.fo_log_record_edit();
drop trigger if exists vehicle_inspection_photos_log_edits on public.vehicle_inspection_photos;
create trigger vehicle_inspection_photos_log_edits after insert or update or delete on public.vehicle_inspection_photos
  for each row execute function public.fo_log_record_edit();
drop trigger if exists vehicle_inspection_damage_points_log_edits on public.vehicle_inspection_damage_points;
create trigger vehicle_inspection_damage_points_log_edits after insert or update or delete on public.vehicle_inspection_damage_points
  for each row execute function public.fo_log_record_edit();
