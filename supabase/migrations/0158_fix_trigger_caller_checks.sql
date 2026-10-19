-- Fix for 0156 / 0157: those trigger functions were SECURITY DEFINER and decided "is this a client request?" with current_user - but inside a
-- SECURITY DEFINER function current_user is the function OWNER, so the check was always "not a client" and the triggers never blocked anything.
-- The trigger functions are now plain (invoker) functions, so current_user is the real caller role (authenticated / anon for app and website
-- requests; postgres / service_role for server code, which stays exempt). The few things that need elevated reads go through small SECURITY
-- DEFINER helpers.
create or replace function public.promo_window_error_for_code(p_code text, p_start date, p_end date)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_row promo_codes%rowtype;
begin
  select * into v_row from promo_codes where upper(code) = upper(trim(p_code)) limit 1;
  if not found then
    return null;
  end if;
  return promo_window_error(v_row, p_start, p_end);
end;
$$;
revoke all on function public.promo_window_error_for_code(text, date, date) from public, anon;
grant execute on function public.promo_window_error_for_code(text, date, date) to authenticated;

create or replace function public.check_booking_promo_window()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare v_err text;
begin
  if current_user not in ('authenticated', 'anon') or is_admin() or new.promo_code is null then
    return new;
  end if;
  v_err := promo_window_error_for_code(new.promo_code, new.start_date, new.end_date);
  if v_err is not null then
    raise exception '%', v_err using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.inspection_is_submitted(p_inspection_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from vehicle_inspections where id = p_inspection_id and status = 'submitted');
$$;
revoke all on function public.inspection_is_submitted(uuid) from public, anon;
grant execute on function public.inspection_is_submitted(uuid) to authenticated;

create or replace function public.lock_submitted_inspection()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare v_submitted boolean;
begin
  if current_user not in ('authenticated', 'anon') or is_admin() then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'vehicle_inspections' then
    v_submitted := old.status = 'submitted';
  else
    v_submitted := inspection_is_submitted(coalesce(new.inspection_id, old.inspection_id));
  end if;

  if v_submitted then
    raise exception 'This inspection has already been submitted and can no longer be changed.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
