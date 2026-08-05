create table booking_inquiries (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  car_id uuid references cars(id) on delete set null,
  start_date date,
  end_date date,
  message text,
  status text not null default 'new' check (status in ('new', 'contacted', 'converted', 'closed')),
  source text not null default 'website',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index booking_inquiries_status_idx on booking_inquiries(status);
create index booking_inquiries_created_at_idx on booking_inquiries(created_at desc);
create index booking_inquiries_car_id_idx on booking_inquiries(car_id);

alter table booking_inquiries enable row level security;

-- Public website form will submit without auth (anon key) - insert-only,
-- no read-back, so this can't leak other submitters' data.
--
-- IMPORTANT for whoever builds that form: call .insert({...}) WITHOUT
-- chaining .select() on the client. Postgres evaluates RETURNING against
-- the SELECT policy, and anon has none here (intentionally) - chaining
-- .select() (Prefer: return=representation) makes even a valid insert
-- fail with a misleading "row violates row-level security policy" error.
-- Verified live against this project on 2026-08-05.
create policy booking_inquiries_public_insert on booking_inquiries
  for insert to anon
  with check (true);

create policy booking_inquiries_admin_all on booking_inquiries
  for all to authenticated
  using (is_admin())
  with check (is_admin());
