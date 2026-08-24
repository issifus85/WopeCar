-- BACKFILL - already applied live (ledger version 20260803180001, name
-- add_reviews_table). Never committed to this repo - this is the original
-- schema for the reviews module (5-category ratings: cleanliness/accuracy/
-- communication/value/convenience) referenced in this session's own memory
-- as "built from scratch", which it was - just never committed as a file.

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  renter_id uuid not null references auth.users(id) on delete cascade,
  overall_rating smallint not null check (overall_rating between 1 and 5),
  cleanliness_rating smallint check (cleanliness_rating between 1 and 5),
  accuracy_rating smallint check (accuracy_rating between 1 and 5),
  communication_rating smallint check (communication_rating between 1 and 5),
  value_rating smallint check (value_rating between 1 and 5),
  convenience_rating smallint check (convenience_rating between 1 and 5),
  content text,
  is_published boolean not null default true,
  is_featured boolean not null default false,
  hidden_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reviews_car_id_idx on public.reviews(car_id);
create index if not exists reviews_vendor_id_idx on public.reviews(vendor_id);

alter table public.reviews enable row level security;

drop policy if exists reviews_public_select on public.reviews;
create policy reviews_public_select on public.reviews
  for select using (is_published = true);

drop policy if exists reviews_renter_select_own on public.reviews;
create policy reviews_renter_select_own on public.reviews
  for select using (renter_id = auth.uid());

drop policy if exists reviews_renter_insert on public.reviews;
create policy reviews_renter_insert on public.reviews
  for insert with check (
    renter_id = auth.uid()
    and exists (
      select 1 from public.bookings
      where id = booking_id and renter_id = auth.uid() and status = 'completed'
    )
  );

drop policy if exists reviews_renter_update on public.reviews;
create policy reviews_renter_update on public.reviews
  for update using (renter_id = auth.uid()) with check (renter_id = auth.uid());

drop policy if exists reviews_admin_all on public.reviews;
create policy reviews_admin_all on public.reviews
  for all using (is_admin()) with check (is_admin());

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function set_updated_at();

create or replace function restrict_renter_review_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_admin() then
    return new;
  end if;

  if new.is_published is distinct from old.is_published
    or new.is_featured is distinct from old.is_featured
    or new.hidden_reason is distinct from old.hidden_reason
    or new.booking_id is distinct from old.booking_id
    or new.car_id is distinct from old.car_id
    or new.vendor_id is distinct from old.vendor_id
    or new.renter_id is distinct from old.renter_id
  then
    raise exception 'Renters may only update their ratings and review content.';
  end if;

  return new;
end;
$$;

drop trigger if exists reviews_renter_update_guard on public.reviews;
create trigger reviews_renter_update_guard
  before update on public.reviews
  for each row execute function restrict_renter_review_update();
