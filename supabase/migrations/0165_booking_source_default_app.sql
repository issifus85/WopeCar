-- Bookings from an OLD copy of the mobile app (a freshly installed/updated store build runs the code baked into that build, from before bookings were
-- tagged with their channel) arrived with booking_source NULL. Every other channel tags itself explicitly: the website sends 'website' and staff-made
-- bookings 'admin', so a booking that does not say where it came from can only be the app. Default it to 'app'. (Older rows stay NULL = "before
-- tracking"; the 3 stragglers created after tagging began were set to 'app' by hand on 2026-10-27.)
alter table public.bookings alter column booking_source set default 'app';
