-- cars.payout_per_day (what WopeCar pays the vendor) lived on a table whose SELECT policy is public, so anyone
-- could read every car's payout rate through the API. It moves to an admin-only table. This is phase 1: create +
-- backfill + repoint the booking trigger, and keep the old column in sync until the admin app and modify-booking
-- are deployed. Phase 2 (0139) drops the column.
create table if not exists public.car_payouts (
  car_id uuid primary key references public.cars(id) on delete cascade,
  payout_per_day numeric not null default 0 check (payout_per_day >= 0),
  updated_at timestamptz not null default now()
);
alter table public.car_payouts enable row level security;
revoke all on public.car_payouts from anon;
drop policy if exists car_payouts_admin_all on public.car_payouts;
create policy car_payouts_admin_all on public.car_payouts for all to authenticated
  using (is_admin()) with check (is_admin());

insert into public.car_payouts (car_id, payout_per_day)
select id, coalesce(payout_per_day, 0) from public.cars
on conflict (car_id) do update set payout_per_day = excluded.payout_per_day;

-- New cars get a row automatically so reads never have to special-case "missing".
create or replace function public.ensure_car_payout_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.car_payouts (car_id, payout_per_day) values (new.id, coalesce(new.payout_per_day, 0))
  on conflict (car_id) do nothing;
  return new;
end $$;
drop trigger if exists cars_ensure_payout_row on public.cars;
create trigger cars_ensure_payout_row after insert on public.cars for each row execute function public.ensure_car_payout_row();

-- Bridge while the old admin build can still write the column.
create or replace function public.sync_car_payout_from_column() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.car_payouts (car_id, payout_per_day, updated_at) values (new.id, coalesce(new.payout_per_day, 0), now())
  on conflict (car_id) do update set payout_per_day = excluded.payout_per_day, updated_at = now();
  return new;
end $$;
drop trigger if exists cars_sync_payout_from_column on public.cars;
create trigger cars_sync_payout_from_column after update of payout_per_day on public.cars
  for each row when (new.payout_per_day is distinct from old.payout_per_day) execute function public.sync_car_payout_from_column();

create or replace function public.compute_booking_vendor_payout() returns trigger
language plpgsql security definer set search_path = public as $$
declare car_payout numeric;
begin
  select payout_per_day into car_payout from public.car_payouts where car_id = new.car_id;
  car_payout := coalesce(car_payout, 0);

  new.vendor_payout_per_day := car_payout;
  new.vendor_payout_total := round(car_payout * greatest(new.billable_days, 0), 2);
  new.wopecar_margin := round(new.total_cost - new.vendor_payout_total, 2);
  return new;
end $$;
