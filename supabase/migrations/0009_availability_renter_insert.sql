-- Gap found during Phase 2 (bookings core) browser verification:
-- markDatesBooked() (services/supabaseApi.js) is called by a renter's own
-- session after their payment is confirmed, but availability only had an
-- INSERT policy for the car's vendor (0002_rls_policies.sql) - a renter
-- marking their own booked dates was silently rejected by RLS (caught by
-- the best-effort .catch(() => {}) in checkout/payment.js, so the booking
-- still completed, but the date never actually got blocked for others).
--
-- Scoped narrowly: a renter may only insert a 'booked' row for a car/date
-- that falls inside one of their own paid bookings for that exact car -
-- they can't mark arbitrary dates/cars as booked.
create policy availability_renter_insert_for_paid_booking on availability for insert to authenticated
  with check (
    status = 'booked'
    and exists (
      select 1 from bookings
      where bookings.car_id = availability.car_id
        and bookings.renter_id = auth.uid()
        and bookings.payment_status = 'paid'
        and availability.date >= bookings.start_date
        and availability.date <= bookings.end_date
    )
  );
