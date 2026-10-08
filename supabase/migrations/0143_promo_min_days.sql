-- Promo codes can require a minimum booking length (e.g. the December Detty code: at least 3 days).
-- Enforced here, in the database, so no client can skip it. Callers pass the booking's billable days (for a
-- multi-booking cart: the SHORTEST booking). A code that has a minimum but is used by an older app build that does not
-- send the days is refused with an "update the app" message rather than silently skipping the rule.
alter table public.promo_codes
  add column if not exists min_days int check (min_days is null or min_days >= 1);

drop function if exists public.validate_promo_code(text);
drop function if exists public.redeem_promo_code(text);

create or replace function public.validate_promo_code(p_code text, p_days int default null)
returns table(code text, discount_type text, discount_value numeric, min_days int)
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_row promo_codes%rowtype;
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

  return query select v_row.code, v_row.discount_type, v_row.discount_value, v_row.min_days;
end;
$$;

create or replace function public.redeem_promo_code(p_code text, p_days int default null)
returns table(code text, discount_type text, discount_value numeric, min_days int)
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_row promo_codes%rowtype;
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

  update promo_codes set uses_count = uses_count + 1 where id = v_row.id;

  return query select v_row.code, v_row.discount_type, v_row.discount_value, v_row.min_days;
end;
$$;

grant execute on function public.validate_promo_code(text, int) to anon, authenticated, service_role;
grant execute on function public.redeem_promo_code(text, int) to anon, authenticated, service_role;
