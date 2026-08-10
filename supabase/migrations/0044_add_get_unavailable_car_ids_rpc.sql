-- Search-result availability filtering (app/(tabs)/index.js's date-range
-- search, via services/carsApi.js's fetchCars/fetchUnavailableCarIds) needs
-- to check ALL cars' paid bookings for a date range, not just the caller's
-- own - bookings_renter_select/bookings_vendor_select correctly scope a
-- normal SELECT to `renter_id = auth.uid()` / vendor-owned cars only, since
-- bookings carries PII (renter name/phone/payment_ref). Same shape of
-- problem as 0031_add_get_partner_stats_rpc.sql: the caller needs a derived
-- fact (which cars are taken), not row access. This SECURITY DEFINER RPC
-- returns ONLY car_id - no renter/vendor identifiers, no pricing, no dates
-- beyond what the caller already searched for.
--
-- Matches the exclusion constraint's own definition of a real, blocking
-- booking (0041_bookings_no_overlapping_paid_dates.sql): status <>
-- 'cancelled' and payment_status = 'paid'. A pending/unpaid booking is not
-- a confirmed hold, so it doesn't block a search result here.
create or replace function public.get_unavailable_car_ids(p_start_date date, p_end_date date)
returns table (car_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  select distinct b.car_id
  from bookings b
  where b.status <> 'cancelled'
    and b.payment_status = 'paid'
    and b.start_date <= p_end_date
    and b.end_date >= p_start_date;
end;
$function$;

grant execute on function public.get_unavailable_car_ids(date, date) to anon, authenticated;
