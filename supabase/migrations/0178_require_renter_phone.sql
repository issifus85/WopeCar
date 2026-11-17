-- A renter must have a phone number on their profile (public.users.phone) before they can create a booking or a
-- Save & Pay Later hold, so the host and WopeCar support can always reach them beyond email.
--
-- Why: the app's Booking Details step asked for a phone but never saved it to the profile (only the address), so
-- renters who signed up with Apple/Google (no phone at signup) ended up with confirmed bookings showing "Phone: -"
-- (e.g. WC-2026-5510). The app now saves it before Payment; this trigger is the server-side backstop for every client.
--
-- Scope: only rows a signed-in renter inserts for themselves (auth.uid() = renter_id). Admin-created bookings, the
-- service role / edge functions, and every UPDATE (payment confirmation, modifications, cancellations) are untouched,
-- and existing rows are not checked. Needs at least 7 digits, the same rule as the app (utils/phone.js).
-- Safe to re-run.

create or replace function public.require_renter_phone()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_phone text;
begin
  -- auth.uid() reads the request's JWT, so it still names the caller inside this security definer function
  -- (current_user would not: it is the function owner here).
  if auth.uid() is null or new.renter_id is distinct from auth.uid() or is_admin() then
    return new;
  end if;

  select phone into v_phone from users where id = new.renter_id;
  if length(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g')) < 7 then
    raise exception 'Please add your phone number to your profile before booking.'
      using errcode = '23514', hint = 'phone_required';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_require_renter_phone on public.bookings;
create trigger bookings_require_renter_phone
  before insert on public.bookings
  for each row execute function public.require_renter_phone();

drop trigger if exists pending_invoices_require_renter_phone on public.pending_invoices;
create trigger pending_invoices_require_renter_phone
  before insert on public.pending_invoices
  for each row execute function public.require_renter_phone();
