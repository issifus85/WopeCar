-- Phase 2 of the payout move (see 0138): the rate now lives only in the admin-only car_payouts table.
drop trigger if exists cars_sync_payout_from_column on public.cars;
drop trigger if exists cars_restrict_vendor_payout_update on public.cars;
drop function if exists public.sync_car_payout_from_column();
drop function if exists public.restrict_vendor_car_payout_update();
create or replace function public.ensure_car_payout_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.car_payouts (car_id, payout_per_day) values (new.id, 0) on conflict (car_id) do nothing;
  return new;
end $$;
alter table public.cars drop column if exists payout_per_day;
