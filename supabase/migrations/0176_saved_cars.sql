-- Account-level "saved cars" list, shared by the app's Favourites (heart)
-- and wopecar.com's Saved cars. Before this both lived only on the device
-- (SecureStore / localStorage), so a renter who saved cars on the website
-- found an empty list in the app after signing in, and vice versa.
--
-- Same shape and RLS posture as cart_items (0113): one row per (user, car),
-- the signed-in renter can only see and change their own rows. Clients
-- treat it as best-effort - if this table is missing they keep working
-- from local storage exactly as before.
create table if not exists saved_cars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  car_id uuid not null references cars(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, car_id)
);

create index if not exists saved_cars_user_id_idx on saved_cars(user_id);

alter table saved_cars enable row level security;

drop policy if exists "Users manage own saved cars" on saved_cars;
create policy "Users manage own saved cars" on saved_cars
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
