alter table blog_posts add column faqs jsonb not null default '[]'::jsonb;
