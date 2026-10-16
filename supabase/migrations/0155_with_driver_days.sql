-- "With Driver" can now cover only SOME of the trip's days (self-drive cars). with_driver_days = how many days the renter wants the
-- driver for; NULL means "every billable day" (all bookings made before this existed, and the default), so old rows keep meaning
-- exactly what they did. with_driver_total_cost stays the money: with_driver_daily_rate x driver days.
--   * driver covers EVERY day  -> free delivery + flat chauffeur security deposit (as before)
--   * driver covers only some days -> normal self-drive delivery fee + self-drive security deposit
alter table public.bookings add column if not exists with_driver_days integer;
alter table public.pending_invoices add column if not exists with_driver_days integer;
alter table public.bookings drop constraint if exists bookings_with_driver_days_check;
alter table public.bookings add constraint bookings_with_driver_days_check check (with_driver_days is null or with_driver_days >= 1);
alter table public.pending_invoices drop constraint if exists pending_invoices_with_driver_days_check;
alter table public.pending_invoices add constraint pending_invoices_with_driver_days_check check (with_driver_days is null or with_driver_days >= 1);
