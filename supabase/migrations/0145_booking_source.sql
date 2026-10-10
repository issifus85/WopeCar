-- Which channel created a booking: the mobile app, the website, or an admin. Set by the client at insert time (app ->
-- 'app', website -> 'website'). NULL = made before this was tracked (or by an older app build that doesn't send it).
alter table public.bookings
  add column if not exists booking_source text;
alter table public.bookings
  drop constraint if exists bookings_booking_source_check;
alter table public.bookings
  add constraint bookings_booking_source_check check (booking_source is null or booking_source in ('app', 'website', 'admin'));
create index if not exists bookings_booking_source_idx on public.bookings (booking_source);
