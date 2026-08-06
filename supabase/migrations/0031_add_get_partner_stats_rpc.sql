-- The website's partner-CTA "Avg. host earnings" / "Time to first booking"
-- stats need to be computed from bookings + vendors, but those tables carry
-- PII and are correctly locked down from the public anon key the website
-- uses (see wopecar-website/lib/supabase/client.ts - stateless, no session).
-- Same shape of problem as promo_codes/validate_promo_code(): the public
-- site needs a derived number, not row access. This SECURITY DEFINER RPC
-- returns only two aggregates plus their sample sizes - no vendor/booking
-- identifiers - so wopecar-website's partnerStats.ts can decide whether
-- there's enough real data to show live (see that file's MIN_SAMPLE_SIZE)
-- or fall back to the admin-edited app_settings values.
create or replace function public.get_partner_stats()
returns table (
  avg_monthly_earnings_ghs numeric,
  earnings_sample_size int,
  avg_days_to_first_booking numeric,
  booking_sample_size int
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with paid_window as (
    select vendor_id, total_cost
    from bookings
    where payment_status = 'paid'
      and vendor_id is not null
      and created_at >= now() - interval '90 days'
  ),
  first_bookings as (
    select b.vendor_id, min(b.created_at) as first_booking_at
    from bookings b
    where b.vendor_id is not null
    group by b.vendor_id
  )
  select
    (select coalesce(sum(total_cost), 0) / nullif(count(distinct vendor_id), 0) / 3.0 from paid_window),
    (select count(distinct vendor_id)::int from paid_window),
    (select avg(extract(epoch from (fb.first_booking_at - v.created_at)) / 86400.0)
       from first_bookings fb join vendors v on v.id = fb.vendor_id),
    (select count(*)::int from first_bookings);
end;
$function$;

grant execute on function public.get_partner_stats() to anon, authenticated;
