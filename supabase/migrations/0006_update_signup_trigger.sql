-- WopeCar Supabase schema - extends the signup trigger (from
-- 0004_gap_fixes.sql) to also accept phone/role from signup metadata, now
-- that register() in services/supabaseAuthApi.js passes them. Run this in
-- the SQL Editor after 0005_extend_users_profile.sql.
--
-- Switched from "on conflict do nothing" to "do update ... coalesce" so a
-- retried signUp() call (e.g. after a network hiccup) applies its fresher
-- metadata instead of the first attempt's data staying stuck forever.

create or replace function handle_new_auth_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name, phone, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    coalesce(new.raw_user_meta_data->>'role', 'renter')
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.users.full_name),
    phone = coalesce(excluded.phone, public.users.phone),
    role = coalesce(excluded.role, public.users.role);
  return new;
end;
$$ language plpgsql security definer set search_path = public;
