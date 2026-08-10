-- The car detail page's "hosted by" partner card needs a vendor's
-- business_name (and join date, for "Member since X") - `vendors` has NO
-- public/anon SELECT policy at all (only vendors_own_select, scoped to
-- `user_id = auth.uid()`, and vendors_admin_all). The website's anon client
-- embedding `vendor:vendors(id, business_name)` on `cars` therefore always
-- got back null for `vendor`, silently - the partner card conditionally
-- rendered on `car.vendor?.business_name` and just never showed at all.
-- Confirmed live: the vendor row for hyundai-elantra-2019 has a real
-- business_name ("Issi"), but the site couldn't read it.
--
-- Same "derived fact, not row access" fix as get_partner_stats() and
-- get_unavailable_car_ids() - exposes only business_name + created_at for
-- one car's vendor, nothing else (no bank info, no documents, no owner
-- contact details).
create or replace function public.get_car_host_info(p_car_id uuid)
returns table (business_name text, member_since timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select v.business_name, v.created_at
  from cars c
  join vendors v on v.id = c.vendor_id
  where c.id = p_car_id
  limit 1;
end;
$$;

grant execute on function public.get_car_host_info(uuid) to anon, authenticated;
