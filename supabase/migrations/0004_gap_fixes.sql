-- WopeCar Supabase schema - gap fixes flagged during Steps 4 and 7.
-- Run this in the SQL Editor after 0003_storage_policies.sql.

-- =========================================================================
-- Gap: no signup path for `users` rows (flagged in 0002_rls_policies.sql)
-- =========================================================================
-- SECURITY DEFINER so it can insert into public.users despite that table's
-- RLS having no INSERT policy for regular users by design - this trigger
-- is the sanctioned path in, not a bypass of the intent. on_conflict do
-- nothing makes it safe to fire more than once for the same auth user.
--
-- Deliberately NOT doing the same for `vendors`: becoming a vendor is a
-- real business decision (ghana_card_id, bank details, admin approval),
-- not something that should happen automatically at signup for every user.
-- That gap stays as-is - a vendor row still needs an admin/service_role to
-- create it.

create or replace function handle_new_auth_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- =========================================================================
-- Gap: vendors can't accept/decline a booking (flagged in
-- 0002_rls_policies.sql - bookings had SELECT-only for vendors)
-- =========================================================================
-- The RLS policy alone only controls WHICH rows a vendor can update, not
-- WHICH COLUMNS - so it's paired with a trigger that rejects any vendor
-- update touching anything other than status/vendor_accepted. Admin
-- updates skip this check entirely.

create policy bookings_vendor_update on bookings for update to authenticated
  using (is_vendor_owner(vendor_id))
  with check (is_vendor_owner(vendor_id));

create or replace function restrict_vendor_booking_update()
returns trigger as $$
begin
  if is_admin() then
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

create trigger bookings_vendor_update_guard
  before update on bookings
  for each row execute function restrict_vendor_booking_update();

-- =========================================================================
-- Gap: content_blocks had no public read policy, so a published page
-- couldn't render its own blocks (flagged in 0002_rls_policies.sql)
-- =========================================================================
create policy content_blocks_public_select on content_blocks for select to public
  using (
    is_visible = true
    and exists (select 1 from pages where pages.id = content_blocks.page_id and pages.is_published = true)
  );

-- =========================================================================
-- Gap: availability had no renter/public read policy, so a renter's app
-- couldn't check blocked/booked dates before booking (flagged in
-- 0002_rls_policies.sql)
-- =========================================================================
-- Scoped to only active cars' availability, mirroring cars' own public
-- visibility rule - a pending/inactive listing's schedule isn't exposed.
create policy availability_public_select on availability for select to public
  using (exists (select 1 from cars where cars.id = availability.car_id and cars.status = 'active'));

-- =========================================================================
-- Gap: `vendors` table has no public read at all, so fetchCarById()'s
-- vendor join always returned null for a normal renter (flagged in
-- services/supabaseApi.js's fetchCarById). `vendors` also has real
-- sensitive columns (ghana_card_id, bank_name, bank_account,
-- total_earnings) that must stay private - RLS can't expose some columns
-- of a row while hiding others, so this adds a narrow view instead of
-- opening up the table itself.
-- =========================================================================
create view vendor_public_profiles as
  select id, business_name, is_approved from vendors;

grant select on vendor_public_profiles to anon, authenticated;
