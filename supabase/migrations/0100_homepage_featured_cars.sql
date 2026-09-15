-- The homepage "Popular cars near you" section is auto-populated (3 newest
-- active cars + 3 "best value" cars, i.e. cars.is_recommended - the same
-- flag already labelled "Best Value" on /book-a-car's sort dropdown), with
-- optional admin pins layered on top so a specific car can be forced into
-- the section regardless of the auto algorithm. See wopecar-website's
-- getFeaturedHomeCars() and wopecar-admin's Homepage editor "Featured
-- Rentals" card.

create table homepage_featured_cars (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references cars(id) on delete cascade unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index homepage_featured_cars_sort_order_idx on homepage_featured_cars (sort_order);

alter table homepage_featured_cars enable row level security;

create policy homepage_featured_cars_public_select on homepage_featured_cars
  for select using (true);

create policy homepage_featured_cars_admin_all on homepage_featured_cars
  for all
  using (is_admin())
  with check (is_admin());
