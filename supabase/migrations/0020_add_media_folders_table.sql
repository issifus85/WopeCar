create table media_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table media_folders enable row level security;

create policy media_folders_public_select on media_folders
  for select to authenticated
  using (true);

create policy media_folders_admin_write on media_folders
  for all to authenticated
  using (is_support())
  with check (is_support());

-- Preserve the 3 existing hardcoded folders so nothing already uploaded
-- under them appears to vanish.
insert into media_folders (name) values ('website'), ('mobile'), ('general');
