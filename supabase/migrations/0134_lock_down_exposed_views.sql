-- vendor_bookings_view / vendor_cars_view are unused column-masking views over bookings/cars. They ran as
-- their owner (bypassing RLS) and anon held ALL privileges, so anyone could read every booking/car through
-- them and even UPDATE cars through vendor_cars_view. Nothing in any client uses them.
alter view public.vendor_bookings_view set (security_invoker = true);
alter view public.vendor_cars_view set (security_invoker = true);
revoke all on public.vendor_bookings_view from anon, authenticated;
revoke all on public.vendor_cars_view from anon, authenticated;

-- vendor_public_profiles must stay publicly readable (business name, approved flag, avatar) but read-only.
revoke insert, update, delete, truncate, references, trigger on public.vendor_public_profiles from anon, authenticated;
