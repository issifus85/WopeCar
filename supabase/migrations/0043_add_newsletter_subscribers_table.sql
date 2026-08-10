create table newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text not null default 'website',
  created_at timestamptz not null default now()
);

create index newsletter_subscribers_created_at_idx on newsletter_subscribers(created_at desc);

alter table newsletter_subscribers enable row level security;

-- Same pattern as booking_inquiries_public_insert
-- (0022_add_booking_inquiries_table.sql): public footer form submits
-- without auth (anon key), insert-only, no read-back, so this can't leak
-- other subscribers' emails. Whoever calls this from the client MUST NOT
-- chain .select() on the insert - anon has no SELECT policy here
-- (intentionally), and Postgres evaluates RETURNING against the SELECT
-- policy, so a valid insert would fail with a misleading RLS error
-- (see supabase_anon_insert_rls_quirk).
create policy newsletter_subscribers_public_insert on newsletter_subscribers
  for insert to anon
  with check (true);

create policy newsletter_subscribers_admin_all on newsletter_subscribers
  for all to authenticated
  using (is_admin())
  with check (is_admin());
