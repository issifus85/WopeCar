-- SECOND HALF of the vendor lockdown (see 0153). DO NOT APPLY until the app update that reads `vendor_bookings` and calls
-- `vendor_accept_booking` has reached vendors - app builds from before it read the bookings table directly and would show an
-- empty bookings list / fail "accept" for vendors still on them.
drop policy if exists bookings_vendor_select on public.bookings;
drop policy if exists bookings_vendor_update on public.bookings;

-- The older security_invoker view relied on the very policy dropped above (it would now return nothing); the app reads vendor_bookings.
drop view if exists public.vendor_bookings_view;
