-- restrict_renter_booking_update() (0089_vendor_payout_pricing_system.sql)
-- skips its own restriction check entirely when auth.uid() is null: the
-- `old.renter_id is distinct from auth.uid()` comparison is true whenever
-- auth.uid() is null (a real UUID IS DISTINCT FROM null), so an
-- unauthenticated update request falls straight through to `return new`
-- instead of being blocked. Found during an audit prompted by the
-- create_or_get_inquiry_conversation null-auth.uid() bug (0042) - same
-- "null auth.uid() produces wrong behavior" class, but a silent logic
-- bypass here rather than a crash. Table-level RLS on bookings should
-- already stop an unauthenticated UPDATE from reaching this trigger at
-- all, so this is defense-in-depth, not a fix for an observed exploit -
-- but it brings this trigger in line with its sibling
-- restrict_vendor_booking_update(), which uses is_vendor_owner() (already
-- null-safe) rather than a raw auth.uid() comparison.
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

  if auth.uid() is null then
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
