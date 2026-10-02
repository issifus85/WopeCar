-- 0127 made restrict_renter_booking_update() raise whenever auth.uid() was
-- null, which also rejected every legitimate server-side update to bookings
-- (service_role Edge Functions, SQL, migrations all run with a null
-- auth.uid()). Caught 2026-10-02 when a plain `update bookings` from SQL
-- failed with "Not authorized to update this booking." Narrowed to reject
-- only client roles with no identity (anon / authenticated-without-sub),
-- which is what 0127 actually set out to block.
create or replace function restrict_renter_booking_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if is_admin() then
    return new;
  end if;

  -- Only reject callers that arrived as a client role with no usable
  -- identity (anon, or an authenticated JWT with no sub). Trusted server
  -- contexts - service_role Edge Functions, SQL/migrations (no JWT role at
  -- all) - also have a null auth.uid() and must keep working.
  if auth.uid() is null and coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'Not authorized to update this booking.';
  end if;

  if old.renter_id is distinct from auth.uid() then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.booking_ref is distinct from old.booking_ref
    or new.renter_id is distinct from old.renter_id
    or new.car_id is distinct from old.car_id
    or new.vendor_id is distinct from old.vendor_id
    or new.start_date is distinct from old.start_date
    or new.end_date is distinct from old.end_date
    or new.pickup_time is distinct from old.pickup_time
    or new.return_time is distinct from old.return_time
    or new.pickup_location is distinct from old.pickup_location
    or new.return_location is distinct from old.return_location
    or new.drive_type is distinct from old.drive_type
    or new.addon_names is distinct from old.addon_names
    or new.addon_days is distinct from old.addon_days
    or new.rental_cost is distinct from old.rental_cost
    or new.addons_cost is distinct from old.addons_cost
    or new.delivery_fee is distinct from old.delivery_fee
    or new.security_deposit is distinct from old.security_deposit
    or new.total_cost is distinct from old.total_cost
    or new.vendor_payout_per_day is distinct from old.vendor_payout_per_day
    or new.vendor_payout_total is distinct from old.vendor_payout_total
    or new.wopecar_margin is distinct from old.wopecar_margin
    or new.vendor_accepted is distinct from old.vendor_accepted
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Renters may only update status and payment fields on their own booking.';
  end if;

  return new;
end;
$$;
