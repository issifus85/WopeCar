-- Finishes 0174. 0174 made admin_mark_booking_paid() write the reference the admin typed to bookings.payment_ref,
-- and routed method 'paystack_dashboard' through confirm-booking-payment so a real Paystack reference is verified
-- with Paystack first. But the two do not ship together: the database has 0174 the moment it is applied, while an
-- admin client that has not been updated yet still calls the function directly. For every other method that is
-- harmless - a bank / mobile money reference is only ever read by a human, and cancel-booking knows not to send it
-- to Paystack. For 'paystack_dashboard' it is not: that reference IS treated as a Paystack transaction, so an
-- unverified one (mistyped, or belonging to a different booking's charge) could have cancel-booking refund against
-- a transaction that is not this booking's.
--
-- So a Paystack reference is now only accepted once it is already on the booking - which is to say, once
-- confirm-booking-payment has verified it with Paystack and written it. An old client gets a clear refusal instead
-- of writing a reference nobody checked. Recording the payment under another method with a note still works, and so
-- does 'paystack_dashboard' with a note and no reference (nothing unverified is written then).

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

  -- A Paystack reference is never taken on trust: it is accepted only once it is on the booking, which only
  -- confirm-booking-payment (admin mode) can do, after Paystack has confirmed the transaction.
  if not v_audit_only and p_method = 'paystack_dashboard' and v_ref is not null then
    raise exception 'A Paystack payment is recorded by verifying it with Paystack. Update the admin tools, or record this payment under the method the money actually arrived by and put the Paystack reference in the note.';
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
