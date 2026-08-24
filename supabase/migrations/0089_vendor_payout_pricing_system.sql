-- BACKFILL - already applied live across 4 migrations, none ever committed
-- to this repo (ledger versions 20260814225726 add_vendor_payout_pricing_
-- system, 20260814234931 fix_vendor_bookings_view_renter_id_leak,
-- 20260814235126 compute_vendor_payout_on_booking_insert, 20260814235325
-- add_vendor_payout_columns_to_vendor_bookings_view). Consolidated into one
-- file using only the FINAL live shape of vendor_bookings_view (the other
-- two intermediate versions of that view were real but are dead - replaying
-- them here would just be historical noise, not anything still relied on).
--
-- This is what services/vendorBookingsApi.js's VENDOR_BOOKING_SELECT and
-- lib/api/appointments.ts etc. actually read from, and what
-- compute_booking_vendor_payout() (referenced in this session's earlier
-- inspection-PDF/cancel-booking work) computes on every booking insert.

-- ── Columns ──────────────────────────────────────────────────────────────

alter table cars
  add column if not exists payout_per_day numeric not null default 0;

alter table bookings
  add column if not exists vendor_payout_per_day numeric not null default 0,
  add column if not exists vendor_payout_total numeric not null default 0,
  add column if not exists wopecar_margin numeric not null default 0,
  add column if not exists billable_days integer not null default 0;

-- ── Write protection: cars.payout_per_day (admin-only) ─────────────────────

create or replace function restrict_vendor_car_payout_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if is_admin() then
    return new;
  end if;

  if new.payout_per_day is distinct from old.payout_per_day then
    raise exception 'Only WopeCar admin can set a car''s payout rate.';
  end if;

  return new;
end;
$$;

drop trigger if exists cars_restrict_vendor_payout_update on cars;
create trigger cars_restrict_vendor_payout_update
  before update of payout_per_day on cars
  for each row
  execute function restrict_vendor_car_payout_update();

-- ── Write protection: bookings payout/commission columns (admin-only) ──────

create or replace function restrict_vendor_booking_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
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
    or new.vendor_payout_per_day is distinct from old.vendor_payout_per_day
    or new.vendor_payout_total is distinct from old.vendor_payout_total
    or new.wopecar_margin is distinct from old.wopecar_margin
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Vendors may only update status and vendor_accepted on a booking.';
  end if;

  return new;
end;
$$;

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

drop trigger if exists bookings_vendor_update_guard on bookings;
create trigger bookings_vendor_update_guard
  before update on bookings
  for each row
  execute function restrict_vendor_booking_update();

drop trigger if exists bookings_renter_update_guard on bookings;
create trigger bookings_renter_update_guard
  before update on bookings
  for each row
  execute function restrict_renter_booking_update();

-- ── Compute payout/margin on booking creation ───────────────────────────

create or replace function compute_booking_vendor_payout()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  car_payout numeric;
begin
  select payout_per_day into car_payout from cars where id = new.car_id;
  car_payout := coalesce(car_payout, 0);

  new.vendor_payout_per_day := car_payout;
  new.vendor_payout_total := round(car_payout * greatest(new.billable_days, 0), 2);
  new.wopecar_margin := round(new.total_cost - new.vendor_payout_total, 2);

  return new;
end;
$$;

drop trigger if exists bookings_compute_vendor_payout on bookings;
create trigger bookings_compute_vendor_payout
  before insert on bookings
  for each row
  execute function compute_booking_vendor_payout();

-- ── Read protection: column-masking views ───────────────────────────────

create or replace view vendor_cars_view as
select
  id, vendor_id, name, make, model, year, type, seats, transmission,
  drive_type, price_per_day, location, region_id, description, features,
  images, status, min_booking_days, advance_notice, booking_window,
  regional_addons, vehicle_class, doors, baggage, cancellation_policy,
  vetting_date, vetting_time, energy_source, discount_enabled,
  discount_type, discount_value, discount_starts_at, discount_ends_at,
  length_of_stay_discounts, faqs, insurance_policy_number, is_recommended,
  slug, seo_title, seo_description, created_at, updated_at
from cars;

grant select on vendor_cars_view to authenticated, anon;

-- Final shape (supersedes two earlier live-but-uncommitted versions of this
-- view) - deliberately excludes renter_id (PII) and every renter-paid /
-- WopeCar-margin column (rental_cost, addons_cost, delivery_fee,
-- security_deposit, total_cost, payment_ref, promo_code,
-- promo_discount_amount, cancellation_reason, refund_amount,
-- wopecare_daily_rate, wopecare_total_cost, wopecar_margin) so a vendor
-- querying this view only ever sees their own locked-in payout, never what
-- the client paid or WopeCar's cut.
create or replace view vendor_bookings_view as
select
  id, booking_ref, car_id, vendor_id, start_date, end_date, pickup_time,
  return_time, pickup_location, return_location, drive_type, addon_names,
  addon_days, billable_days, status, payment_status, vendor_accepted,
  wopecare_plan, wopecare_coverage, vendor_payout_per_day,
  vendor_payout_total, created_at, updated_at
from bookings;

grant select on vendor_bookings_view to authenticated;
