-- "Make a Vehicle Request" on the new Buy a Car "Looking For Something
-- Else?" section - a self-service "let us know what you want" lead form
-- for an anonymous website visitor, separate from car_sale_inquiries
-- (which is always tied to one existing listing) since this has no
-- listing at all - the whole point is the visitor wants something not
-- currently for sale. Same posture/RLS shape as car_sale_inquiries and
-- car_sale_viewing_requests.
create table car_sale_vehicle_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  make_model text not null,
  vehicle_type text,
  preferred_year text,
  budget text,
  status text not null default 'new' check (status in ('new', 'contacted', 'matched', 'closed')),
  admin_notes text,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index car_sale_vehicle_requests_status_idx on car_sale_vehicle_requests(status);
create index car_sale_vehicle_requests_created_at_idx on car_sale_vehicle_requests(created_at desc);

alter table car_sale_vehicle_requests enable row level security;

-- Same anon insert-only policy as car_sale_inquiries/car_sale_viewing_requests,
-- and the same gotcha applies: the client MUST NOT chain .select() on this
-- insert (no SELECT policy for anon here) - see migration 0022's comment
-- for the full explanation of the misleading RLS error that causes.
create policy car_sale_vehicle_requests_public_insert on car_sale_vehicle_requests
  for insert to anon
  with check (true);

create policy car_sale_vehicle_requests_admin_all on car_sale_vehicle_requests
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- New "Looking For Something Else?" section on the Buy a Car page, shown
-- below "See For Yourself" - encourages a visitor to leave a vehicle
-- request when nothing current matches what they want, with the Make a
-- Vehicle Request CTA above wired to it.
alter table car_sales_content add column if not exists request_eyebrow text not null default 'Looking For Something Else?';
alter table car_sales_content add column if not exists request_heading text not null default '';
alter table car_sales_content add column if not exists request_body text not null default '';
alter table car_sales_content add column if not exists request_cta_label text not null default 'Make a Vehicle Request';

update car_sales_content set
  request_heading = 'Tell us what you want next.',
  request_body = E'Our selection changes as WopeCar vehicles become available for sale. Tell us what you’re looking for and we’ll contact you when we have a potential match.'
where request_heading = '';
