-- A promo code can be limited to a TRIP window (e.g. DETTY10: only for rentals in December). valid_from / valid_to are trip dates - the
-- pickup AND the return must both fall inside them - not to be confused with expires_at, which is the last moment the code can be used.
-- Enforced three ways: the validate/redeem functions (given the trip dates), a trigger on booking inserts (so a tampered client can't
-- skip them) and modify-booking (so moving a booked trip out of the window is refused). A client that doesn't send trip dates (older app
-- builds) is told to update, exactly like codes with a minimum length.
alter table public.promo_codes add column if not exists valid_from date;
alter table public.promo_codes add column if not exists valid_to date;

drop function if exists public.validate_promo_code(text, integer);
drop function if exists public.redeem_promo_code(text, integer);

create or replace function public.promo_window_error(v_row promo_codes, p_start date, p_end date)
returns text
language plpgsql
immutable
as $$
begin
  if v_row.valid_from is null and v_row.valid_to is null then
    return null;
  end if;
  if p_start is null or p_end is null then
    return 'Please update the WopeCar app to use this promo code.';
  end if;
  if (v_row.valid_from is not null and p_start < v_row.valid_from) or (v_row.valid_to is not null and p_end > v_row.valid_to) then
    return 'This promo code only applies to trips between '
      || coalesce(to_char(v_row.valid_from, 'FMDD FMMonth YYYY'), 'the start')
      || ' and '
      || coalesce(to_char(v_row.valid_to, 'FMDD FMMonth YYYY'), 'the end')
      || '. Pick dates inside that period to use it.';
  end if;
  return null;
end;
$$;

create or replace function public.validate_promo_code(p_code text, p_days integer default null, p_start date default null, p_end date default null)
returns table(code text, discount_type text, discount_value numeric, min_days integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_row promo_codes%rowtype; v_err text;
begin
  select * into v_row
  from promo_codes pc
  where upper(pc.code) = upper(trim(p_code))
    and pc.is_active
    and (pc.expires_at is null or pc.expires_at > now())
    and (pc.max_uses is null or pc.uses_count < pc.max_uses)
  limit 1;

  if not found then
    return;
  end if;

  if v_row.min_days is not null then
    if p_days is null then
      raise exception 'Please update the WopeCar app to use this promo code.';
    end if;
    if p_days < v_row.min_days then
      raise exception 'This promo code needs a booking of at least % days.', v_row.min_days;
    end if;
  end if;

  v_err := promo_window_error(v_row, p_start, p_end);
  if v_err is not null then
    raise exception '%', v_err;
  end if;

  return query select v_row.code, v_row.discount_type, v_row.discount_value, v_row.min_days;
end;
$$;

create or replace function public.redeem_promo_code(p_code text, p_days integer default null, p_start date default null, p_end date default null)
returns table(code text, discount_type text, discount_value numeric, min_days integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_row promo_codes%rowtype; v_err text;
begin
  select * into v_row
  from promo_codes
  where upper(promo_codes.code) = upper(trim(p_code))
    and is_active
    and (expires_at is null or expires_at > now())
    and (max_uses is null or uses_count < max_uses)
  for update;

  if not found then
    raise exception 'Invalid or expired promo code';
  end if;

  if v_row.min_days is not null then
    if p_days is null then
      raise exception 'Please update the WopeCar app to use this promo code.';
    end if;
    if p_days < v_row.min_days then
      raise exception 'This promo code needs a booking of at least % days.', v_row.min_days;
    end if;
  end if;

  v_err := promo_window_error(v_row, p_start, p_end);
  if v_err is not null then
    raise exception '%', v_err;
  end if;

  update promo_codes set uses_count = uses_count + 1 where id = v_row.id;

  return query select v_row.code, v_row.discount_type, v_row.discount_value, v_row.min_days;
end;
$$;

grant execute on function public.validate_promo_code(text, integer, date, date) to anon, authenticated, service_role;
grant execute on function public.redeem_promo_code(text, integer, date, date) to anon, authenticated, service_role;

-- A booking created with a windowed promo code must be inside the window (client roles only; admins/service role are exempt).
create or replace function public.check_booking_promo_window()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_row promo_codes%rowtype; v_err text;
begin
  if current_user not in ('authenticated', 'anon') or is_admin() or new.promo_code is null then
    return new;
  end if;
  select * into v_row from promo_codes where upper(code) = upper(trim(new.promo_code)) limit 1;
  if not found then
    return new;
  end if;
  v_err := promo_window_error(v_row, new.start_date, new.end_date);
  if v_err is not null then
    raise exception '%', v_err using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists bookings_check_promo_window on public.bookings;
create trigger bookings_check_promo_window before insert on public.bookings for each row execute function public.check_booking_promo_window();
