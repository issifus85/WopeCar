-- Blog migration from wopecar.com (Laravel) to the new Next.js site.
-- blog_posts already existed (id, author_id, title, slug, excerpt, content,
-- cover_image, tags, is_published, published_at, created_at, updated_at,
-- faqs jsonb) - this adds the SEO/editorial columns the new blog templates
-- and admin CMS need. Deliberately does NOT add a second "faq_items"
-- column - the existing `faqs` jsonb ({title, content} shape) already
-- powers generateFAQSchema() on the post page, so it's reused as-is.

alter table blog_posts
  add column if not exists meta_title text,
  add column if not exists meta_description text,
  add column if not exists og_image text,
  add column if not exists focus_keyword text,
  add column if not exists secondary_keywords text[],
  add column if not exists canonical_url text,
  add column if not exists reading_time integer,
  -- Free-text override for scraped/historic posts that have no real users
  -- row to attribute to (same "override when null" pattern as
  -- cars.seo_title/seo_description) - falls back to the author_id relation
  -- when set on a post authored through the admin CMS by a real admin user.
  add column if not exists author_name text,
  add column if not exists author_bio text,
  add column if not exists author_avatar text,
  add column if not exists category text,
  add column if not exists views integer not null default 0,
  add column if not exists is_featured boolean not null default false,
  add column if not exists related_posts uuid[],
  add column if not exists allow_comments boolean not null default true,
  add column if not exists word_count integer;

create index if not exists blog_posts_category_idx on blog_posts (category);
create index if not exists blog_posts_is_featured_idx on blog_posts (is_featured) where is_featured;

-- Comments section on each post - new comments are pending until an admin
-- approves them (allow_comments above gates whether the form even renders).
create table if not exists blog_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references blog_posts(id) on delete cascade,
  name text not null,
  email text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists blog_comments_post_id_idx on blog_comments (post_id);
create index if not exists blog_comments_status_idx on blog_comments (status);

alter table blog_comments enable row level security;

-- Anyone can submit a comment (goes in as 'pending') - matches the
-- insert-only anon RLS pattern already used elsewhere on this project,
-- and per that established quirk, the client must NOT chain .select()
-- after this insert or the insert itself will fail under anon RLS.
create policy blog_comments_public_insert on blog_comments
  for insert to anon, authenticated
  with check (status = 'pending');

-- Only approved comments are visible to the public.
create policy blog_comments_public_select on blog_comments
  for select to anon, authenticated
  using (status = 'approved');

create policy blog_comments_admin_all on blog_comments
  for all to authenticated
  using (is_admin())
  with check (is_admin());
