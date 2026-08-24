-- BACKFILL - this migration was already applied live (Supabase ledger
-- version 20260802182934, name car_dynamic_pricing_and_discounts) but the
-- file was never committed to this repo, so a plain grep of
-- supabase/migrations/ could never find it - discovered while scoping a
-- "new" dynamic-pricing feature request that turned out to already exist
-- end-to-end (car_date_prices already live, already consumed by
-- calculateRentalPricing() at checkout, already had a vendor + mobile-admin
-- write UI - only the web admin write UI was actually missing, added
-- separately). This file documents what's already live; it is NOT meant to
-- be re-run, but is written defensively (IF NOT EXISTS / OR REPLACE) so a
-- fresh environment replaying all local migrations in order still ends up
-- correct.

alter table cars add column if not exists energy_source text;
alter table cars drop constraint if exists cars_energy_source_check;
alter table cars add constraint cars_energy_source_check
  check (energy_source is null or energy_source in ('Gasoline', 'Diesel', 'EV'));

-- Blanket promotional discount (always-on while enabled, optional date window)
alter table cars add column if not exists discount_enabled boolean not null default false;
alter table cars add column if not exists discount_type text;
alter table cars add column if not exists discount_value numeric;
alter table cars add column if not exists discount_starts_at date;
alter table cars add column if not exists discount_ends_at date;
alter table cars drop constraint if exists cars_discount_type_check;
alter table cars add constraint cars_discount_type_check
  check (discount_type is null or discount_type in ('percentage', 'flat'));
alter table cars drop constraint if exists cars_discount_value_check;
alter table cars add constraint cars_discount_value_check
  check (discount_value is null or discount_value >= 0);

-- Length-of-stay discount tiers, e.g. [{"minDays":7,"type":"percentage","value":10}]
alter table cars add column if not exists length_of_stay_discounts jsonb not null default '[]';

-- Per-date custom pricing (true per-day overrides, like an Airbnb pricing
-- calendar) - already wired into checkout's calculateRentalPricing()
-- (constants/pricing.js) via a getDatePrice(iso) lookup, and already has a
-- write UI on both mobile screens (app/vendor/car/pricing/[id].js,
-- app/admin/car/pricing/[id].js via components/CarPricingCalendar.js).
create table if not exists car_date_prices (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references cars(id) on delete cascade,
  date date not null,
  price numeric not null check (price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (car_id, date)
);

alter table car_date_prices enable row level security;

drop policy if exists car_date_prices_public_select on car_date_prices;
create policy car_date_prices_public_select on car_date_prices for select to public
  using (true);

drop policy if exists car_date_prices_vendor_manage on car_date_prices;
create policy car_date_prices_vendor_manage on car_date_prices for all to authenticated
  using (exists (select 1 from cars where cars.id = car_date_prices.car_id and is_vendor_owner(cars.vendor_id)))
  with check (exists (select 1 from cars where cars.id = car_date_prices.car_id and is_vendor_owner(cars.vendor_id)));

drop policy if exists car_date_prices_admin_all on car_date_prices;
create policy car_date_prices_admin_all on car_date_prices for all to authenticated
  using (is_admin()) with check (is_admin());

create index if not exists car_date_prices_car_id_date_idx on car_date_prices (car_id, date);
