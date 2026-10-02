-- Diagnostic trail for push-token registration. services/pushNotifications.js
-- registerPushToken() swallowed every failure (permission denied, token
-- fetch error, upsert error), and push_tokens is empty in production even
-- though ~29 people signed in over 14 days - so nothing could say why no
-- device ever registered. Each step now writes one row here; a signed-in
-- user can only insert their own and only admins can read them.
create table if not exists push_registration_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  platform text,
  step text not null,
  ok boolean not null,
  message text,
  app_version text,
  created_at timestamptz not null default now()
);

alter table push_registration_log enable row level security;

create policy push_registration_log_owner_insert on push_registration_log
  for insert to authenticated with check (user_id = auth.uid());

create policy push_registration_log_admin_select on push_registration_log
  for select to authenticated using (is_admin());
