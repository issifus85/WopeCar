-- BACKFILL - already applied live (ledger version 20260805132801, name
-- add_push_tokens). Never committed to this repo - this is the table
-- send-push-notification (and every Edge Function that calls it) reads.

create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token text not null unique,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table push_tokens enable row level security;

drop policy if exists push_tokens_owner_select on push_tokens;
create policy push_tokens_owner_select on push_tokens
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists push_tokens_owner_insert on push_tokens;
create policy push_tokens_owner_insert on push_tokens
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists push_tokens_owner_update on push_tokens;
create policy push_tokens_owner_update on push_tokens
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists push_tokens_owner_delete on push_tokens;
create policy push_tokens_owner_delete on push_tokens
  for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists push_tokens_admin_all on push_tokens;
create policy push_tokens_admin_all on push_tokens
  for all to authenticated
  using (is_admin())
  with check (is_admin());
