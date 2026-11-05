-- Manually recorded payments never landed on the booking.
--
-- Five website bookings paid in the week to 5 Nov (WC-2026-7242, WC-2026-6037, WC-2026-4100, WC-2026-9657,
-- WC-2026-3995) are `payment_status = 'paid'` with `payment_ref` null. They were all admin "Mark as Paid":
-- the three after 0166 went through admin_mark_booking_paid() and are in booking_manual_payments (mobile
-- money, a Wise transfer, a bank transfer); the two from 30 Oct predate that migration and were the bare
-- `update bookings set payment_status='paid'` it replaced. None was a Paystack charge.
--
-- admin_mark_booking_paid() asked for a reference and then filed it only in booking_manual_payments, so the
-- booking itself carried no trace of how the money arrived: bookings.payment_ref stayed null, cancel-booking
-- could not attribute a refund, and nothing tied the booking to the payment at all.
--
-- Two changes:
--   1. The reference the admin gives is now written to bookings.payment_ref as well (never overwriting one
--      that is already there). For a payment that did not come through Paystack this is a bank/momo/Wise
--      reference, NOT a Paystack transaction id - booking_manual_payments is what says which it is, and
--      cancel-booking checks that table before asking Paystack to refund against it.
--   2. 'paystack_dashboard' - a real Paystack charge the admin found in the dashboard - is now verified
--      against Paystack first by confirm-booking-payment (admin mode), which marks the booking paid through
--      _shared/confirmPayment.ts and writes the reference itself. That gets the payment the same protection
--      as a checkout payment (amount checked, reference never reused, webhook + paystack-reconcile able to
--      recognise it). This function is then called only to file the audit row, with the booking already paid
--      and already carrying that exact reference - the one case where an already-paid booking is accepted.

comment on column public.bookings.payment_ref is
  'Reference for the payment that settled this booking. Usually a Paystack transaction reference (written by _shared/confirmPayment.ts). For a payment recorded by hand it is the bank / mobile money / Wise reference the admin entered: a booking_manual_payments row for the booking is what marks it as NOT a Paystack reference, so never send it to the Paystack refund API without checking that table.';

create or replace function public.admin_mark_booking_paid(p_booking_id uuid, p_method text, p_reference text default null, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  b public.bookings%rowtype;
  v_ref text := nullif(trim(coalesce(p_reference, '')), '');
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_name text;
  v_vendor_user uuid;
  -- A Paystack payment confirm-booking-payment has just verified and applied: this call only files the
  -- audit row for it, so it must not (and need not) touch payment_status or payment_ref.
  v_audit_only boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can record a payment.';
  end if;
  if p_method is null or p_method not in ('bank_transfer', 'mobile_money', 'cash', 'paystack_dashboard', 'other') then
    raise exception 'Choose how the payment was received.';
  end if;
  if v_ref is null and (v_note is null or length(v_note) < 10) then
    raise exception 'Enter the payment reference, or a note (at least 10 characters) saying how the payment was confirmed.';
  end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found.'; end if;
  if b.status = 'cancelled' then raise exception 'This booking is cancelled, so it cannot be marked as paid.'; end if;
  if b.payment_status = 'refunded' then raise exception 'This booking was refunded, so it cannot be marked as paid.'; end if;
  if b.payment_status = 'paid' then
    -- Only the Paystack-verified hand-off above, and only once: the reference must be the one already on the
    -- booking and the booking must have no manual payment filed yet. Anything else is still refused.
    if p_method = 'paystack_dashboard'
       and v_ref is not null
       and b.payment_ref = v_ref
       and not exists (select 1 from public.booking_manual_payments m where m.booking_id = p_booking_id)
    then
      v_audit_only := true;
    else
      raise exception 'This booking is already marked as paid.';
    end if;
  end if;

  select full_name into v_name from public.users where id = auth.uid();

  if not v_audit_only then
    perform set_config('app.manual_payment', 'on', true);
    update public.bookings
       set payment_status = 'paid',
           -- The reference is the booking's own only when it has none; a Paystack reference already there
           -- (a part-payment confirmed through checkout, say) is never replaced by a hand-entered one.
           payment_ref = coalesce(nullif(trim(coalesce(payment_ref, '')), ''), v_ref)
     where id = p_booking_id;
  end if;

  insert into public.booking_manual_payments (booking_id, marked_by, marked_by_name, method, reference, note, amount)
  values (p_booking_id, auth.uid(), v_name, p_method, v_ref, v_note, b.total_cost);

  select user_id into v_vendor_user from public.vendors where id = b.vendor_id;
  insert into public.notifications (user_id, type, title, body, booking_id)
  select u, 'booking_paid', 'Payment recorded', 'Payment for booking ' || b.booking_ref || ' has been marked as received.', b.id
  from unnest(array[b.renter_id, v_vendor_user]) as u
  where u is not null;

  return p_booking_id;
end;
$$;
revoke all on function public.admin_mark_booking_paid(uuid, text, text, text) from public, anon;
grant execute on function public.admin_mark_booking_paid(uuid, text, text, text) to authenticated;

-- cancel-booking and the QuickBooks receipt need to know, from the booking alone, whether its payment_ref is
-- a Paystack transaction. Reading booking_manual_payments is an admin-only policy; the service role bypasses
-- it, but this index keeps the lookup cheap on every cancellation.
create index if not exists booking_manual_payments_booking_created_idx
  on public.booking_manual_payments (booking_id, created_at desc);
