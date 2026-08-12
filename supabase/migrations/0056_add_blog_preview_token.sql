-- Lets the admin CMS "Preview" button open an unpublished/edited draft on
-- the live site without relaxing blog_posts_public_select (still is_published
-- only). preview_token is a stable per-post capability secret; the RPC below
-- is the only way to read a row by it, and it's security definer so it can
-- bypass RLS for exactly that one lookup while the table's own policies stay
-- untouched for every other access path.
alter table blog_posts
  add column if not exists preview_token uuid not null default gen_random_uuid();

create or replace function get_preview_blog_post(p_slug text, p_token uuid)
returns setof blog_posts
language sql
security definer
set search_path = public
as $$
  select * from blog_posts
  where slug = p_slug and preview_token = p_token
  limit 1;
$$;

grant execute on function get_preview_blog_post(text, uuid) to anon, authenticated;
