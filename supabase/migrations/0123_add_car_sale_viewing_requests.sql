-- "Book a Viewing" on the new Buy a Car "See For Yourself" section - a
-- self-service scheduling request from an anonymous website visitor, not
-- tied to a Supabase Auth session (same posture as car_sale_inquiries).
-- Kept as its own table rather than reusing cars.vetting_date/vetting_time
-- (vendor-onboarding vetting) since those columns live on the rental
-- `cars` table, not car_sale_listings, and that flow requires an
-- authenticated vendor/admin caller - not usable by a public visitor.
-- "Mapped to the vetting scheduling" in spirit instead: this reuses the
-- exact same Google Calendar sync machinery (_shared/google-calendar.ts
-- in wopecar-admin, same GOOGLE_* secrets, same fleetops calendar) via a
-- new send-car-sale-viewing-confirmation Edge Function, so ops sees both
-- appointment types on the one calendar.
create table car_sale_viewing_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  car_sale_listing_id uuid references car_sale_listings(id) on delete set null,
  preferred_date date not null,
  preferred_time text not null,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'completed', 'cancelled')),
  admin_notes text,
  google_calendar_event_id text,
  google_calendar_event_url text,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index car_sale_viewing_requests_status_idx on car_sale_viewing_requests(status);
create index car_sale_viewing_requests_created_at_idx on car_sale_viewing_requests(created_at desc);
create index car_sale_viewing_requests_listing_id_idx on car_sale_viewing_requests(car_sale_listing_id);

alter table car_sale_viewing_requests enable row level security;

-- Same anon insert-only policy as car_sale_inquiries, and the same gotcha
-- applies: the client MUST NOT chain .select() on this insert (no SELECT
-- policy for anon here) - see migration 0022's comment for the full
-- explanation of the misleading RLS error that causes.
create policy car_sale_viewing_requests_public_insert on car_sale_viewing_requests
  for insert to anon
  with check (true);

create policy car_sale_viewing_requests_admin_all on car_sale_viewing_requests
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- New "See For Yourself" narrative section on the Buy a Car page, shown
-- between "Why Buy From WopeCar" and the FAQ - encourages an in-person
-- viewing/independent inspection before buying, with the Book a Viewing
-- CTA above wired to it.
alter table car_sales_content add column if not exists viewing_eyebrow text not null default 'See For Yourself';
alter table car_sales_content add column if not exists viewing_heading text not null default '';
alter table car_sales_content add column if not exists viewing_body_1 text not null default '';
alter table car_sales_content add column if not exists viewing_body_2 text not null default '';
alter table car_sales_content add column if not exists viewing_cta_label text not null default 'Book a Viewing';

update car_sales_content set
  viewing_heading = E'Don''t just take our word for it.',
  viewing_body_1 = 'See the vehicle in person, take it for a test drive and review its WopeCar inspection and available maintenance records.',
  viewing_body_2 = E'Want another opinion? You''re welcome to have the vehicle independently inspected by a qualified mechanic before you buy.'
where viewing_heading = '';
