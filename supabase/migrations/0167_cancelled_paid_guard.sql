-- Finishes 0166. On production only the table and admin_mark_booking_paid() went in (migration manual_payment_safeguard_table_and_rpc);
-- the bookings_guard_manual_paid trigger never did, so a bare `update bookings set payment_status='paid'` from a signed-in admin session
-- (e.g. an admin client that has not moved to the RPC yet) still worked on cancelled bookings: WC-2026-3828, WC-2026-3559 (29 Oct) and
-- WC-2026-7365 (Sept) are cancelled AND paid with no payment reference.
-- The guard now also has a rule that holds for every caller, the service role and direct SQL included: a cancelled booking is never flipped
-- to paid unless it carries a payment reference (a real Paystack payment that lands on an already-cancelled booking, via
-- _shared/confirmPayment.ts, sets payment_ref in the same update, so it still goes through and can be refunded). Bookings that were paid
-- before they were cancelled are untouched: only the unpaid -> paid flip is checked.

create or replace function public.guard_manual_paid_flip()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    if new.status = 'cancelled' and nullif(trim(coalesce(new.payment_ref, '')), '') is null then
      raise exception 'This booking is cancelled and has no payment reference, so it cannot be marked as paid.';
    end if;
    if auth.uid() is not null and coalesce(current_setting('app.manual_payment', true), '') <> 'on' then
      raise exception 'Payments are recorded with "Mark as Paid" (payment method and reference required).';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_guard_manual_paid on public.bookings;
create trigger bookings_guard_manual_paid
  before update of payment_status on public.bookings
  for each row execute function public.guard_manual_paid_flip();
