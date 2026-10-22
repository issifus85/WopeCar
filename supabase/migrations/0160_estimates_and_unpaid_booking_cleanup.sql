-- Accounting: stop creating a QuickBooks INVOICE for every booking attempt. An invoice is now created only when a booking is paid;
-- a "Save & Pay Later" hold gets an ESTIMATE (a quote that doesn't count as revenue or money owed) which the invoice later converts.
--
-- 1. estimate columns on the saved-booking holds and on the booking (so the invoice created at payment can link to - and close - it)
alter table public.pending_invoices add column if not exists qb_estimate_id text;
alter table public.pending_invoices add column if not exists qb_estimate_number text;
alter table public.bookings add column if not exists qb_estimate_id text;

-- 2. A renter who starts the same car/dates again replaces their earlier UNPAID attempt instead of piling up pending bookings.
--    Paid bookings and admin-created ones are never touched. (SECURITY DEFINER so the renter-update guard doesn't stop the cancel.)
create or replace function public.supersede_unpaid_bookings()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'pending' and new.payment_status = 'unpaid' and coalesce(new.booking_source, '') <> 'admin' then
    update bookings b
       set status = 'cancelled',
           cancellation_reason = 'Replaced by a newer booking attempt for the same car and dates'
     where b.renter_id = new.renter_id
       and b.car_id = new.car_id
       and b.id <> new.id
       and b.status = 'pending'
       and b.payment_status = 'unpaid'
       and coalesce(b.booking_source, '') <> 'admin'
       and b.start_date <= new.end_date
       and b.end_date >= new.start_date;
  end if;
  return new;
end;
$$;
revoke all on function public.supersede_unpaid_bookings() from public, anon, authenticated;

drop trigger if exists bookings_supersede_unpaid on public.bookings;
create trigger bookings_supersede_unpaid
  after insert on public.bookings
  for each row execute function public.supersede_unpaid_bookings();

-- 3. Unpaid pending bookings that were never paid are closed after a hold (default 24h, app_settings.unpaid_booking_hold_hours).
--    Called every 10 minutes by quickbooks-reconcile (service role). Admin-created bookings are exempt.
create or replace function public.expire_unpaid_bookings(p_hours integer default 24)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare n integer;
begin
  with expired as (
    update bookings
       set status = 'cancelled', cancellation_reason = 'Not paid in time'
     where status = 'pending'
       and payment_status = 'unpaid'
       and coalesce(booking_source, '') <> 'admin'
       and created_at < now() - make_interval(hours => greatest(p_hours, 1))
    returning 1
  )
  select count(*) into n from expired;
  return n;
end;
$$;
revoke all on function public.expire_unpaid_bookings(integer) from public, anon, authenticated;
grant execute on function public.expire_unpaid_bookings(integer) to service_role;
