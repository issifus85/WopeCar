-- Vendors must never be able to read a renter's booking row (totals, costs, payment reference, margin...). Until now the
-- `bookings_vendor_select` policy gave a vendor SELECT on every column of their cars' bookings - the app only ever asked for a
-- few columns, but anyone calling the API directly could ask for all of them.
--
-- This migration is the NON-BREAKING half of the lockdown (old app builds keep working):
--   1. vendor_bookings: a view with ONLY what the vendor module needs (no renter_id, costs, payment reference, margin).
--   2. vendor_owns_booking(): SECURITY DEFINER helper, so the vendor policies on inspections / rental agreements / storage no
--      longer depend on the vendor being able to read the bookings table.
--   3. vendor_accept_booking(): SECURITY DEFINER RPC for "accept request" (the vendor UPDATE policy goes away in the second half,
--      and an UPDATE with a WHERE clause needs SELECT access too).
-- The second half (0154: drop bookings_vendor_select + bookings_vendor_update) is applied once the app update that uses the view has
-- reached vendors.

create or replace function public.vendor_owns_booking(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from bookings b where b.id = p_booking_id and is_vendor_owner(b.vendor_id));
$$;
revoke all on function public.vendor_owns_booking(uuid) from public, anon;
grant execute on function public.vendor_owns_booking(uuid) to authenticated;

-- ---- vendor policies that read bookings: switch to the helper ---------------------------------------------------------------
drop policy if exists vehicle_inspections_vendor_select on public.vehicle_inspections;
create policy vehicle_inspections_vendor_select on public.vehicle_inspections for select to authenticated
  using (vendor_owns_booking(vehicle_inspections.booking_id));
drop policy if exists vehicle_inspections_vendor_write on public.vehicle_inspections;
create policy vehicle_inspections_vendor_write on public.vehicle_inspections for insert to authenticated
  with check (vendor_owns_booking(vehicle_inspections.booking_id));
drop policy if exists vehicle_inspections_vendor_update on public.vehicle_inspections;
create policy vehicle_inspections_vendor_update on public.vehicle_inspections for update to authenticated
  using (vendor_owns_booking(vehicle_inspections.booking_id))
  with check (vendor_owns_booking(vehicle_inspections.booking_id));

drop policy if exists vehicle_inspection_photos_vendor_select on public.vehicle_inspection_photos;
create policy vehicle_inspection_photos_vendor_select on public.vehicle_inspection_photos for select to authenticated
  using (exists (select 1 from vehicle_inspections vi where vi.id = vehicle_inspection_photos.inspection_id and vendor_owns_booking(vi.booking_id)));
drop policy if exists vehicle_inspection_photos_vendor_write on public.vehicle_inspection_photos;
create policy vehicle_inspection_photos_vendor_write on public.vehicle_inspection_photos for insert to authenticated
  with check (exists (select 1 from vehicle_inspections vi where vi.id = vehicle_inspection_photos.inspection_id and vendor_owns_booking(vi.booking_id)));
drop policy if exists vehicle_inspection_photos_vendor_update on public.vehicle_inspection_photos;
create policy vehicle_inspection_photos_vendor_update on public.vehicle_inspection_photos for update to authenticated
  using (exists (select 1 from vehicle_inspections vi where vi.id = vehicle_inspection_photos.inspection_id and vendor_owns_booking(vi.booking_id)))
  with check (exists (select 1 from vehicle_inspections vi where vi.id = vehicle_inspection_photos.inspection_id and vendor_owns_booking(vi.booking_id)));

drop policy if exists vehicle_inspection_damage_points_vendor_select on public.vehicle_inspection_damage_points;
create policy vehicle_inspection_damage_points_vendor_select on public.vehicle_inspection_damage_points for select to authenticated
  using (exists (select 1 from vehicle_inspections vi where vi.id = vehicle_inspection_damage_points.inspection_id and vendor_owns_booking(vi.booking_id)));
drop policy if exists vehicle_inspection_damage_points_vendor_write on public.vehicle_inspection_damage_points;
create policy vehicle_inspection_damage_points_vendor_write on public.vehicle_inspection_damage_points for insert to authenticated
  with check (exists (select 1 from vehicle_inspections vi where vi.id = vehicle_inspection_damage_points.inspection_id and vendor_owns_booking(vi.booking_id)));
drop policy if exists vehicle_inspection_damage_points_vendor_delete on public.vehicle_inspection_damage_points;
create policy vehicle_inspection_damage_points_vendor_delete on public.vehicle_inspection_damage_points for delete to authenticated
  using (exists (select 1 from vehicle_inspections vi where vi.id = vehicle_inspection_damage_points.inspection_id and vendor_owns_booking(vi.booking_id)));

drop policy if exists rental_agreements_vendor_select on public.rental_agreements;
create policy rental_agreements_vendor_select on public.rental_agreements for select to authenticated
  using (vendor_owns_booking(rental_agreements.booking_id));

-- inspection files in the documents bucket (photos by inspection id, the PDF report by booking id + type)
drop policy if exists documents_inspection_participant_select on storage.objects;
create policy documents_inspection_participant_select on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[2] = 'inspections'
    and exists (
      select 1 from vehicle_inspections vi
      where vi.id::text = (storage.foldername(name))[3]
        and (vendor_owns_booking(vi.booking_id) or exists (select 1 from bookings b where b.id = vi.booking_id and b.renter_id = auth.uid()))
    )
  );
drop policy if exists documents_inspection_report_participant_select on storage.objects;
create policy documents_inspection_report_participant_select on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'inspections'
    and exists (
      select 1 from vehicle_inspections vi
      where vi.booking_id::text = (storage.foldername(name))[2]
        and vi.type = (storage.foldername(name))[3]
        and (vendor_owns_booking(vi.booking_id) or exists (select 1 from bookings b where b.id = vi.booking_id and b.renter_id = auth.uid()))
    )
  );

-- ---- what a vendor may see of a booking ------------------------------------------------------------------------------------
-- Owner-privileged view (reads bookings regardless of RLS) that returns only the vendor's own bookings and only these columns.
create or replace view public.vendor_bookings as
select
  b.id, b.booking_ref, b.car_id, b.vendor_id,
  b.start_date, b.end_date, b.pickup_time, b.return_time,
  b.pickup_location, b.return_location, b.drive_type, b.addon_names,
  b.billable_days, b.vendor_payout_per_day, b.vendor_payout_total,
  b.status, b.payment_status, b.vendor_accepted,
  b.created_at, b.updated_at
from public.bookings b
where is_vendor_owner(b.vendor_id);
revoke all on public.vendor_bookings from public, anon;
grant select on public.vendor_bookings to authenticated;

-- ---- vendor accepts a booking request --------------------------------------------------------------------------------------
create or replace function public.vendor_accept_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not vendor_owns_booking(p_booking_id) then
    raise exception 'Not your booking' using errcode = '42501';
  end if;
  -- Only a request still waiting for the vendor can be accepted. (Runs as the vendor: the bookings_vendor_update_guard trigger
  -- still limits what may change to status + vendor_accepted.)
  update bookings
     set status = 'confirmed', vendor_accepted = true
   where id = p_booking_id
     and status = 'pending'
     and vendor_accepted is distinct from true;
  if not found then
    raise exception 'This booking request can no longer be accepted' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.vendor_accept_booking(uuid) from public, anon;
grant execute on function public.vendor_accept_booking(uuid) to authenticated;
