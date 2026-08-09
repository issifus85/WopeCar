-- Hard DB-level lock preventing two paid bookings for the same car from
-- ever having overlapping date ranges - closes the race the client-side
-- calendar check (fetchCarAvailability/dates.js) can't fully close on its
-- own (two renters checking out for the same car within the same window).
--
-- Scoped to `payment_status = 'paid'`, not `status <> 'cancelled'` alone:
-- there is no reservation-expiry mechanism anywhere in this app (no cron,
-- no TTL, nothing cancels an abandoned pending/unpaid checkout - see
-- app/checkout/payment.js's handlePay, which inserts a 'pending'/'unpaid'
-- booking via createBooking() *before* charging Paystack). Locking on
-- pending/unpaid rows too would let one abandoned checkout permanently
-- squat a car's dates forever with no way to release them. Paid is the
-- real "money changed hands" signal - the same one markDatesBooked()
-- already keys off of when populating the `availability` table renters
-- see in the date picker.
--
-- Data note: applying this required resolving 4 pre-existing overlapping
-- paid-booking pairs already present in the live table (the exact bug
-- class this constraint prevents, already manifested for real) - the
-- later-created booking in each pair was cancelled first. See git history
-- / cancellation_reason on those rows for the record.
create extension if not exists btree_gist;

alter table bookings
  add constraint bookings_no_overlapping_paid_dates
  exclude using gist (
    car_id with =,
    daterange(start_date, end_date, '[]') with &&
  )
  where (status <> 'cancelled' and payment_status = 'paid');
