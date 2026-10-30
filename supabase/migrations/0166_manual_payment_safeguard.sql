-- Marking a booking as paid by hand (admin "Mark as Paid") used to be a bare `update bookings set payment_status='paid'` from the
-- browser/phone: no proof asked for, no record of who did it, and it even worked on cancelled bookings (WC-2026-3828 / 3559 ended up
-- cancelled AND paid with no Paystack reference). It now goes through admin_mark_booking_paid(), which
--   - is admin-only, refuses cancelled / already-paid / refunded bookings,
--   - requires a payment method plus a reference or a note,
--   - writes who did it and why to booking_manual_payments,
--   - then sets the status and notifies the renter and the vendor (what the clients used to do themselves).
-- A trigger then stops any signed-in session from flipping unpaid -> paid any other way (the Paystack confirmation / webhook functions
-- run as the service role, which has no auth.uid(), so they are unaffected; so is direct SQL by the project owner).

create table if not exists public.booking_manual_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  marked_by uuid references public.users(id) on delete set null,
  marked_by_name text,
  method text not null check (method in ('bank_transfer', 'mobile_money', 'cash', 'paystack_dashboard', 'other')),
  reference text,
  note text,
  amount numeric,
  created_at timestamptz not null default now()
);
create index if not exists booking_manual_payments_booking_idx on public.booking_manual_payments (booking_id);
alter table public.booking_manual_payments enable row level security;
drop policy if exists "Admins read manual payments" on public.booking_manual_payments;
create policy "Admins read manual payments" on public.booking_manual_payments for select using (public.is_admin());

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
  if b.payment_status = 'paid' then raise exception 'This booking is already marked as paid.'; end if;
  if b.payment_status = 'refunded' then raise exception 'This booking was refunded, so it cannot be marked as paid.'; end if;

  select full_name into v_name from public.users where id = auth.uid();

  perform set_config('app.manual_payment', 'on', true);
  update public.bookings set payment_status = 'paid' where id = p_booking_id;

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

create or replace function public.guard_manual_paid_flip()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.payment_status = 'paid'
     and old.payment_status is distinct from 'paid'
     and auth.uid() is not null
     and coalesce(current_setting('app.manual_payment', true), '') <> 'on' then
    raise exception 'Payments are recorded with "Mark as Paid" (payment method and reference required).';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_guard_manual_paid on public.bookings;
create trigger bookings_guard_manual_paid
  before update of payment_status on public.bookings
  for each row execute function public.guard_manual_paid_flip();
