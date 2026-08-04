-- Bookings core: makes booking creation Supabase-native (see the "Laravel
-- -> Supabase Data Migration, Phase 2: Bookings" plan). Bookings previously
-- only ever really existed in local on-device storage - Laravel's booking
-- write was best-effort and its failures were silently swallowed.

-- Per-addon day-count granularity (the {name, days} shape introduced in an
-- earlier phase) had no column to land in - only addon_names existed.
alter table bookings add column addon_days integer[];

-- Tracks license-front/license-back/proof-of-address uploads (captured by
-- checkout/form.js's image pickers today but never actually persisted
-- anywhere real). Also the foundation the Vehicle Inspections and Rental
-- Agreements follow-up phases will reuse for photos/PDFs - not a one-off.
-- The `documents` storage bucket + its folder-ownership RLS policies
-- (documents/<user_id>/...) already exist (0003_storage_policies.sql) -
-- only this metadata table is new.
create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  booking_id uuid references bookings(id) on delete cascade,
  type text not null check (type in ('license_front', 'license_back', 'proof_of_address')),
  file_path text not null,
  created_at timestamptz not null default now()
);

alter table documents enable row level security;

-- Deliberately owner-only, no vendor access - license/proof-of-address
-- images are renter PII a vendor has no legitimate need to see, same
-- principle as vendor_public_profiles trimming vendor data for renters.
create policy documents_owner_select on documents for select to authenticated
  using (user_id = auth.uid());

create policy documents_owner_insert on documents for insert to authenticated
  with check (user_id = auth.uid());

create policy documents_admin_all on documents for all to authenticated
  using (is_admin()) with check (is_admin());

-- restrict_vendor_booking_update() (0004_gap_fixes.sql) fires on EVERY
-- update to this table unconditionally (it only skips for is_admin()) - not
-- just vendor-authorized ones. Its restricted-field list includes
-- payment_status/payment_ref, so without this fix it would also block the
-- renter's own legitimate payment-confirmation update below (both triggers
-- fire regardless of which RLS policy let the update through). Patched to
-- only apply when the update is actually vendor-driven; a renter's own
-- update on their own booking now correctly falls through to
-- restrict_renter_booking_update() instead.
create or replace function restrict_vendor_booking_update()
returns trigger as $$
begin
  if is_admin() then
    return new;
  end if;

  if not is_vendor_owner(old.vendor_id) then
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
    or new.payment_ref is distinct from old.payment_ref
    or new.payment_status is distinct from old.payment_status
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Vendors may only update status and vendor_accepted on a booking.';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Renters previously had zero UPDATE policy on bookings at all (only
-- vendor-accept/decline and admin from 0004_gap_fixes.sql) - needed for
-- both post-payment confirmation (payment_status/payment_ref) and
-- cancellation (status='cancelled'). Guarded the same way the vendor
-- update is guarded: RLS controls WHICH rows, this trigger controls WHICH
-- columns, so a renter can never rewrite dates/cost/vendor_accepted/etc.
-- through it.
create policy bookings_renter_update on bookings for update to authenticated
  using (renter_id = auth.uid())
  with check (renter_id = auth.uid());

create or replace function restrict_renter_booking_update()
returns trigger as $$
begin
  if is_admin() then
    return new;
  end if;

  -- Only guard updates being made by the booking's own renter - a vendor's
  -- update on the same row is already governed by
  -- restrict_vendor_booking_update() from 0004_gap_fixes.sql.
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
    or new.vendor_accepted is distinct from old.vendor_accepted
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Renters may only update status and payment fields on their own booking.';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger bookings_renter_update_guard
  before update on bookings
  for each row execute function restrict_renter_booking_update();
