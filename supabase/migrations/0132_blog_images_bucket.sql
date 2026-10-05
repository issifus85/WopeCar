-- Re-hosting blog post images off the legacy Laravel origin (wopecar.com/
-- uploads/...), which stops serving them when wopecar.com's DNS is cut over
-- to the new website. Used by the one-time migrate-blog-images-to-storage
-- Edge Function.

insert into storage.buckets (id, name, public)
values ('blog-images', 'blog-images', true)
on conflict (id) do nothing;

create policy blog_images_public_select on storage.objects for select to public
  using (bucket_id = 'blog-images');

create policy blog_images_admin_all on storage.objects for all to authenticated
  using (bucket_id = 'blog-images' and is_admin())
  with check (bucket_id = 'blog-images' and is_admin());

-- Original values of every column the migration rewrites, so it can be
-- reverted exactly. RLS on with no policies = service_role only.
create table if not exists public.blog_image_migration_backup (
  blog_post_id uuid primary key,
  cover_image text,
  og_image text,
  content text,
  migrated_at timestamptz not null default now()
);
alter table public.blog_image_migration_backup enable row level security;
