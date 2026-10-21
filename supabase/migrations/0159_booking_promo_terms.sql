-- The app's Modify Booking screen has to re-price a promo booking against the new dates, but promo_codes is admin-only (renters validate a
-- code through validate_promo_code). This returns the discount definition of the promo already used on the caller's OWN booking so the
-- screen can show the right difference instead of asking the renter to pay the discount again. Staff can read any booking's.
create or replace function public.booking_promo_terms(p_booking_id uuid)
returns table(discount_type text, discount_value numeric)
language sql
stable
security definer
set search_path to 'public'
as $$
  select pc.discount_type, pc.discount_value
  from bookings b
  join promo_codes pc on upper(pc.code) = upper(b.promo_code)
  where b.id = p_booking_id
    and b.promo_code is not null
    and (b.renter_id = auth.uid() or is_admin() or exists (select 1 from users u where u.id = auth.uid() and u.is_support))
  limit 1;
$$;
revoke all on function public.booking_promo_terms(uuid) from public, anon;
grant execute on function public.booking_promo_terms(uuid) to authenticated;
