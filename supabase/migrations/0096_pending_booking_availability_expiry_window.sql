-- Real gap, not a hypothetical: get_booked_dates_for_cars (0060) and
-- get_unavailable_car_ids (0044) both only ever counted payment_status =
-- 'paid' bookings as "taken" - a real bookings row is created with
-- status='pending', payment_status='unpaid' the INSTANT checkout starts
-- (app/checkout/payment.js's createBooking(), before the Paystack charge -
-- same reserve-then-confirm pattern on the website), so a renter mid-
-- checkout, or one who abandons checkout entirely, never blocked the
-- calendar for anyone else. Confirmed live: neither platform's calendar
-- greyed out a pending renter's dates.
--
-- Blocking on payment_status='paid' alone was itself a deliberate choice
-- (see 0041's own comment) specifically BECAUSE there was no reservation-
-- expiry mechanism anywhere in the app - blocking every pending row would
-- let one abandoned checkout permanently squat a car's dates forever, with
-- no way to release them. That's still true - this migration doesn't add a
-- cron/cleanup job. Instead the pending-row exception is itself time-boxed
-- to a 30-minute window computed live at query time (b.created_at > now()
-- - interval '30 minutes'), long enough for one real checkout session,
-- short enough that an abandoned cart self-expires on its own within half
-- an hour with zero extra infrastructure. bookings.status/payment_status
-- are never mutated by this - a stale pending row just silently stops
-- appearing in these two RPCs' results once it ages out.
--
-- bookings_no_overlapping_paid_dates (0041) is deliberately NOT touched
-- here - it stays scoped to payment_status='paid' only, so this is a
-- calendar/search-filtering fix (what a renter SEES as available), not a
-- concurrency-control change to what the database allows two renters to
-- simultaneously insert.
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
    and (
      b.payment_status = 'paid'
      or (b.payment_status = 'unpaid' and b.status = 'pending' and b.created_at > now() - interval '30 minutes')
    );
$$;

create or replace function public.get_unavailable_car_ids(p_start_date date, p_end_date date)
returns table (car_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select distinct b.car_id
  from bookings b
  where b.status <> 'cancelled'
    and (
      b.payment_status = 'paid'
      or (b.payment_status = 'unpaid' and b.status = 'pending' and b.created_at > now() - interval '30 minutes')
    )
    and b.start_date <= p_end_date
    and b.end_date >= p_start_date;
end;
$$;
