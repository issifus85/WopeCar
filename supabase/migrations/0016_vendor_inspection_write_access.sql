-- Vendor Mode's pickup/return inspection wizard (app/vendor/inspection/*)
-- was local-only because the vendor side of vehicle_inspections was
-- select-only (0012_vehicle_inspections.sql) - only the renter could write.
-- Now that Vendor Mode bookings have real server ids (vendorBookingsApi),
-- a vendor doing their own handover (common for self-drive with no
-- in-person WopeCar agent) needs the same write access the renter has,
-- scoped to their own cars' bookings via the existing is_vendor_owner()
-- helper. Renter and vendor can both write the same record - matches the
-- "Renter Signature" + "Host/Agent Signature" UI, which already expects
-- either party present at handover to be the one filling it in.

create policy vehicle_inspections_vendor_write on vehicle_inspections for insert to authenticated
  with check (exists (
    select 1 from bookings b where b.id = vehicle_inspections.booking_id and is_vendor_owner(b.vendor_id)
  ));

create policy vehicle_inspections_vendor_update on vehicle_inspections for update to authenticated
  using (exists (
    select 1 from bookings b where b.id = vehicle_inspections.booking_id and is_vendor_owner(b.vendor_id)
  ))
  with check (exists (
    select 1 from bookings b where b.id = vehicle_inspections.booking_id and is_vendor_owner(b.vendor_id)
  ));

create policy vehicle_inspection_photos_vendor_write on vehicle_inspection_photos for insert to authenticated
  with check (exists (
    select 1 from vehicle_inspections vi join bookings b on b.id = vi.booking_id
    where vi.id = vehicle_inspection_photos.inspection_id and is_vendor_owner(b.vendor_id)
  ));

create policy vehicle_inspection_photos_vendor_update on vehicle_inspection_photos for update to authenticated
  using (exists (
    select 1 from vehicle_inspections vi join bookings b on b.id = vi.booking_id
    where vi.id = vehicle_inspection_photos.inspection_id and is_vendor_owner(b.vendor_id)
  ))
  with check (exists (
    select 1 from vehicle_inspections vi join bookings b on b.id = vi.booking_id
    where vi.id = vehicle_inspection_photos.inspection_id and is_vendor_owner(b.vendor_id)
  ));

create policy vehicle_inspection_damage_points_vendor_write on vehicle_inspection_damage_points for insert to authenticated
  with check (exists (
    select 1 from vehicle_inspections vi join bookings b on b.id = vi.booking_id
    where vi.id = vehicle_inspection_damage_points.inspection_id and is_vendor_owner(b.vendor_id)
  ));

create policy vehicle_inspection_damage_points_vendor_delete on vehicle_inspection_damage_points for delete to authenticated
  using (exists (
    select 1 from vehicle_inspections vi join bookings b on b.id = vi.booking_id
    where vi.id = vehicle_inspection_damage_points.inspection_id and is_vendor_owner(b.vendor_id)
  ));
