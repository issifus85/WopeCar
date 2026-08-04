-- WopeCar Supabase schema - Step 2 (tables only, no RLS/seed data).
-- Run this once in the Supabase SQL Editor (or `supabase db push` if the
-- CLI is ever adopted). Tables are created in FK-dependency order.

-- gen_random_uuid() ships enabled by default on Supabase projects, but this
-- is idempotent and harmless to keep the migration portable to any Postgres.
create extension if not exists pgcrypto;

-- Shared trigger: every table below with an `updated_at` column gets one.
-- Without this, `updated_at default now()` only ever fires on INSERT and
-- the column silently stops meaning anything after the first UPDATE.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =========================================================================
-- Table 1: users (profile row for each auth.users identity)
-- =========================================================================
create table users (
  -- ON DELETE CASCADE wasn't in the spec but is added deliberately: without
  -- it, deleting an auth.users row would fail (or leave an orphaned profile)
  -- since nothing else here creates/removes auth.users rows independently.
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  phone text,
  avatar_url text,
  role text not null default 'renter' check (role in ('renter', 'vendor', 'admin')),
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_set_updated_at
  before update on users
  for each row execute function set_updated_at();

-- =========================================================================
-- Table 2: regions
-- =========================================================================
create table regions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  position integer not null default 0
);

-- =========================================================================
-- Table 3: vendors
-- =========================================================================
create table vendors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  business_name text,
  ghana_card_id text,
  bank_name text,
  bank_account text,
  total_earnings numeric not null default 0,
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger vendors_set_updated_at
  before update on vendors
  for each row execute function set_updated_at();

-- =========================================================================
-- Table 4: cars
-- =========================================================================
create table cars (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id) on delete cascade,
  name text not null,
  make text,
  model text,
  year integer,
  type text check (type in ('SUV', 'Mid Size SUV', 'Sedan', 'Bus', 'Pickup', 'Mini Van')),
  seats integer,
  transmission text check (transmission in ('Automatic', 'Manual')),
  drive_type text check (drive_type in ('Self Drive', 'Chauffeur', 'Both')),
  price_per_day numeric not null,
  location text,
  region_id uuid references regions(id),
  description text,
  features text[],
  images text[],
  status text not null default 'pending' check (status in ('active', 'pending', 'inactive')),
  min_booking_days integer not null default 1,
  advance_notice integer not null default 1,
  booking_window integer not null default 3,
  regional_addons jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger cars_set_updated_at
  before update on cars
  for each row execute function set_updated_at();

-- =========================================================================
-- Table 5: availability
-- =========================================================================
create table availability (
  id uuid primary key default gen_random_uuid(),
  car_id uuid references cars(id) on delete cascade,
  date date not null,
  status text check (status in ('blocked', 'booked')),
  created_at timestamptz not null default now(),
  unique (car_id, date)
);

-- =========================================================================
-- Table 6: bookings
-- =========================================================================
create table bookings (
  id uuid primary key default gen_random_uuid(),
  booking_ref text unique not null,
  renter_id uuid references users(id),
  car_id uuid references cars(id),
  vendor_id uuid references vendors(id),
  start_date date not null,
  end_date date not null,
  pickup_time text,
  return_time text,
  pickup_location text,
  return_location text,
  drive_type text,
  addon_names text[],
  rental_cost numeric not null default 0,
  addons_cost numeric not null default 0,
  delivery_fee numeric not null default 0,
  security_deposit numeric not null default 0,
  total_cost numeric not null default 0,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  payment_ref text,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),
  vendor_accepted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger bookings_set_updated_at
  before update on bookings
  for each row execute function set_updated_at();

-- =========================================================================
-- Table 7: messages
-- =========================================================================
create table messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references users(id),
  receiver_id uuid references users(id),
  booking_id uuid references bookings(id),
  content text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Table 8: notifications
-- =========================================================================
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  -- Spec omitted "foreign key -> bookings.id" for this column specifically
  -- (unlike messages.booking_id, which states it explicitly) - left as a
  -- plain uuid rather than assuming that was a spec oversight.
  booking_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Table 9: pages
-- =========================================================================
create table pages (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  meta_title text,
  meta_desc text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger pages_set_updated_at
  before update on pages
  for each row execute function set_updated_at();

-- =========================================================================
-- Table 10: content_blocks
-- =========================================================================
create table content_blocks (
  id uuid primary key default gen_random_uuid(),
  page_id uuid references pages(id) on delete cascade,
  type text check (type in ('hero', 'text', 'image', 'faq', 'testimonial', 'cars_grid')),
  position integer not null default 0,
  data jsonb,
  is_visible boolean not null default true,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Table 11: faqs
-- =========================================================================
create table faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  category text check (category in ('general', 'booking', 'payment', 'vendor')),
  position integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Table 12: testimonials
-- =========================================================================
create table testimonials (
  id uuid primary key default gen_random_uuid(),
  author_name text not null,
  review text not null,
  rating integer check (rating >= 1 and rating <= 5),
  source text check (source in ('google', 'app', 'manual')),
  is_featured boolean not null default false,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Table 13: blog_posts
-- =========================================================================
create table blog_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references users(id),
  title text not null,
  slug text unique not null,
  excerpt text,
  content text,
  cover_image text,
  tags text[],
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger blog_posts_set_updated_at
  before update on blog_posts
  for each row execute function set_updated_at();

-- =========================================================================
-- Table 14: promo_codes
-- =========================================================================
create table promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  discount_type text check (discount_type in ('percentage', 'flat')),
  discount_value numeric not null,
  max_uses integer,
  uses_count integer not null default 0,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Table 15: app_settings
-- =========================================================================
create table app_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

create trigger app_settings_set_updated_at
  before update on app_settings
  for each row execute function set_updated_at();
