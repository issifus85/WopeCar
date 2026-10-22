-- When a booking was PAID, stamped by the database the moment payment_status becomes 'paid' (whatever path does it: Paystack confirmation,
-- webhook, admin "Mark as Paid"). QuickBooks needs it: the receipt (payment) is dated the day the money was received, which can be hours or
-- days after the booking row was created. Older paid rows are left null; their receipts fall back to the booking's created date.
alter table public.bookings add column if not exists paid_at timestamptz;

create or replace function public.stamp_booking_paid_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.payment_status = 'paid' and (tg_op = 'INSERT' or old.payment_status is distinct from 'paid') and new.paid_at is null then
    new.paid_at := now();
  elsif new.payment_status <> 'paid' and tg_op = 'UPDATE' and old.payment_status = 'paid' and new.payment_status = 'unpaid' then
    new.paid_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_stamp_paid_at on public.bookings;
create trigger bookings_stamp_paid_at
  before insert or update of payment_status on public.bookings
  for each row execute function public.stamp_booking_paid_at();
