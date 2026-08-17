-- Fixes a real double-charge incident: renter-facing calendars (mobile
-- checkout date picker, mobile car-detail read-only calendar, and the
-- website's car-detail calendar/search-filter/"available from" badges)
-- all derived "booked" dates from the `availability` table, which only
-- gets its 'booked' rows from a best-effort client call
-- (markDatesBooked(), fired after a payment succeeds, wrapped in
-- .catch(() => {})). Audited the live table: 5 of 10 real confirmed+paid
-- bookings never got their dates written there at all, including all 3 of
-- one specific car's bookings - so its calendar showed an already-booked
-- date as open, a renter picked it, paid, and only then got rejected by
-- the bookings_no_overlapping_paid_dates exclude constraint (0041) - after
-- their card had already been charged.
--
-- This RPC derives booked dates directly from `bookings` instead - the
-- same source of truth the exclude constraint itself uses, and the same
-- pattern get_unavailable_car_ids() (0044) already uses correctly for
-- search-result filtering, and the pattern the vendor/admin calendars
-- (services/vendorCalendar.js's bookedRangesForCar, driven by real
-- booking history, not `availability`) already used correctly too - this
-- brings the renter-facing calendars in line with those, instead of
-- inventing a new pattern.
--
-- Batched by car_ids array (not a single p_car_id) so one call can serve
-- both a single-car calendar screen (pass a 1-element array) and a
-- multi-car search/listing filter, without needing two near-duplicate
-- functions.
--
-- SECURITY DEFINER + car_id/date only (no renter PII) because bookings_
-- renter_select/bookings_vendor_select RLS scope a normal SELECT to the
-- caller's own bookings only - a renter or anonymous website visitor
-- checking a car's calendar needs to see that OTHER people's paid
-- bookings occupy certain dates, without seeing anything else about them.
create or replace function public.get_booked_dates_for_cars(p_car_ids uuid[])
returns table (car_id uuid, date date)
language sql
security definer
set search_path = public
stable
as $$
  select b.car_id, generate_series(b.start_date, b.end_date, interval '1 day')::date as date
  from bookings b
  where b.car_id = any(p_car_ids)
    and b.status <> 'cancelled'
    and b.payment_status = 'paid';
$$;

grant execute on function public.get_booked_dates_for_cars(uuid[]) to anon, authenticated;
