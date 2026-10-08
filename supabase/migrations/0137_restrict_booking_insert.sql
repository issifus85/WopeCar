-- A signed-in renter could INSERT a booking that was already status='confirmed', payment_status='paid'
-- (with any total_cost) because the bookings insert policy only checks renter_id = auth.uid(). Direct client
-- inserts now always start as an unpaid, pending reservation; payment state is set later only by
-- confirm-booking-payment / paystack-webhook / an admin. Every real client already inserts exactly that.
create or replace function public.restrict_booking_insert()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user not in ('authenticated', 'anon') or is_admin() then
    return new;
  end if;

  new.status := 'pending';
  new.payment_status := 'unpaid';
  new.payment_ref := null;
  new.refund_amount := 0;
  new.qb_invoice_id := null;
  new.qb_invoice_number := null;
  new.qb_customer_id := null;
  new.qb_payment_id := null;
  new.qb_invoice_url := null;
  new.qb_receipt_url := null;
  new.qb_credit_note_id := null;
  new.invoice_status := 'not_created';
  return new;
end;
$$;

drop trigger if exists bookings_restrict_insert on public.bookings;
create trigger bookings_restrict_insert
  before insert on public.bookings
  for each row execute function public.restrict_booking_insert();
