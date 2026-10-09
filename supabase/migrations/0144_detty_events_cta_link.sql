-- The Detty December page's events section ends with a "Read the blog ->" link that was hard-coded to /blog.
-- Its label and address are now editable in admin (Content > Pages > Detty December).
alter table public.detty_december_content
  add column if not exists events_cta_label text not null default 'Read the blog →',
  add column if not exists events_cta_url text not null default '/blog';
