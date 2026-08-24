-- BACKFILL - already applied live (ledger version 20260804035358, name
-- add_media_library_bucket). Never committed to this repo. Confirmed live
-- via storage.buckets (id='media', public=true, created 2026-08-04) -
-- bucket creation never shows up in information_schema, only storage.buckets.

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists media_public_select on storage.objects;
create policy media_public_select on storage.objects for select to public
  using (bucket_id = 'media');

drop policy if exists media_admin_insert on storage.objects;
create policy media_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and is_support());

drop policy if exists media_admin_update on storage.objects;
create policy media_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and is_support());

drop policy if exists media_admin_delete on storage.objects;
create policy media_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and is_support());
