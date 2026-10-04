-- Admin hard-delete of a car listing (web admin Fleet page).
--
-- bookings.car_id (and pending_invoices.car_id) reference the car, and a
-- booking is a financial/legal record, so a car that was ever booked or has
-- a saved Pay-Later invoice can NEVER be deleted - the admin must deactivate
-- it instead. Everything else hanging off the car is either cascaded by its
-- own FK (availability, date prices, cart items, documents, featured slot,
-- reviews) or handled here:
--   * inquiry conversations (car-anchored chats, no booking) are deleted
--     with the car - detaching them (car_id = null) would silently re-file
--     them as "general" support conversations, see 0072.
--   * media_folders keep their files but lose the car link.

create or replace function public.admin_car_delete_impact(p_car_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_admin() then
    raise exception 'Not authorized.';
  end if;
  return jsonb_build_object(
    'bookings', (select count(*) from bookings where car_id = p_car_id),
    'pending_invoices', (select count(*) from pending_invoices where car_id = p_car_id),
    'inquiry_conversations', (select count(*) from conversations where car_id = p_car_id)
  );
end;
$$;

create or replace function public.admin_delete_car(p_car_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Not authorized.';
  end if;

  if exists (select 1 from bookings where car_id = p_car_id) then
    raise exception 'This car has booking history and cannot be deleted. Deactivate it instead.';
  end if;
  if exists (select 1 from pending_invoices where car_id = p_car_id) then
    raise exception 'This car has a saved Pay Later invoice and cannot be deleted. Deactivate it instead.';
  end if;

  delete from conversations where car_id = p_car_id;
  update media_folders set car_id = null where car_id = p_car_id;
  delete from cars where id = p_car_id;
end;
$$;

revoke all on function public.admin_car_delete_impact(uuid) from public, anon;
revoke all on function public.admin_delete_car(uuid) from public, anon;
grant execute on function public.admin_car_delete_impact(uuid) to authenticated;
grant execute on function public.admin_delete_car(uuid) to authenticated;
