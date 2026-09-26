-- Extends car_sale_listings (migration 0109) to support the new "Enquire"
-- pop-up: a real image slider (was single image_url only), a description,
-- and a features list. image_url is kept as-is (still used as the card
-- thumbnail on the listing grid) - images is the additional gallery shown
-- inside the modal, backfilled from the existing single photo so listings
-- built before this migration still show something in the slider.
alter table car_sale_listings add column if not exists images jsonb not null default '[]'::jsonb;
alter table car_sale_listings add column if not exists description text not null default '';
-- string[]
alter table car_sale_listings add column if not exists features jsonb not null default '[]'::jsonb;

update car_sale_listings
set images = jsonb_build_array(image_url)
where images = '[]'::jsonb and image_url is not null;

-- Car-sale equivalent of booking_inquiries (migration 0022 + 0048), for the
-- new per-listing contact form in the Enquire modal. Kept as its own table
-- rather than reusing booking_inquiries: that table's car_id references the
-- rental `cars` table, not car_sale_listings, and repurposing it risks the
-- live booking-inquiry pipeline (admin bookings inbox, its own Edge
-- Function). Mirrors booking_inquiries' schema, RLS and notified_at
-- idempotency pattern exactly.
create table car_sale_inquiries (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  car_sale_listing_id uuid references car_sale_listings(id) on delete set null,
  message text,
  status text not null default 'new' check (status in ('new', 'contacted', 'converted', 'closed')),
  admin_notes text,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index car_sale_inquiries_status_idx on car_sale_inquiries(status);
create index car_sale_inquiries_created_at_idx on car_sale_inquiries(created_at desc);
create index car_sale_inquiries_listing_id_idx on car_sale_inquiries(car_sale_listing_id);

alter table car_sale_inquiries enable row level security;

-- Same anon insert-only policy as booking_inquiries, and the same gotcha
-- applies: the client MUST NOT chain .select() on this insert (no SELECT
-- policy for anon here) - see migration 0022's comment for the full
-- explanation of the misleading RLS error that causes.
create policy car_sale_inquiries_public_insert on car_sale_inquiries
  for insert to anon
  with check (true);

create policy car_sale_inquiries_admin_all on car_sale_inquiries
  for all to authenticated
  using (is_admin())
  with check (is_admin());
