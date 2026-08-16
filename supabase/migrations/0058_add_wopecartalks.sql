-- WopeCarTalks (/wopecartalks on the public website, "WopeCarTalks" under
-- the WopeCar footer column) - the WopeCar podcast. Same singleton-content
-- + separate-list-table split as share_your_car_content/testimonials
-- (migration 0050): one row of page-level marketing copy plus the three
-- platform channel URLs, and a real list table for episodes (title,
-- rich-text show notes, thumbnail, per-platform links) that an admin adds
-- to indefinitely over time - too open-ended a list to cram into the
-- singleton row's jsonb the way the fixed 4-item arrays elsewhere on this
-- page are.

create table wopecartalks_content (
  id uuid primary key default gen_random_uuid(),

  hero_eyebrow text not null default 'The WopeCar Podcast',
  hero_heading text not null default '',
  hero_body text not null default '',
  hero_image_url text,
  hero_badge_top text not null default '',
  hero_badge_bottom text not null default '',

  -- Channel URLs - blank until the show is actually live on each platform,
  -- same "leave blank until live" convention as
  -- app_settings.app_store_url/play_store_url. Read by both the hero/final
  -- CTA badge links and every episode card that doesn't set its own
  -- per-episode link.
  youtube_url text,
  apple_podcasts_url text,
  spotify_url text,

  listen_eyebrow text not null default 'Watch or listen',
  listen_heading text not null default '',
  listen_body text not null default '',

  episodes_eyebrow text not null default 'Latest episodes',
  episodes_heading text not null default '',

  why_eyebrow text not null default 'About the show',
  why_heading text not null default '',
  -- [{icon_key, title, body}] x4
  why_rows jsonb not null default '[]'::jsonb,
  quote_text text not null default '',
  quote_image_url text,

  stats_eyebrow text not null default 'By the numbers',
  stats_heading text not null default '',
  -- [{value, label}] x4
  stats jsonb not null default '[]'::jsonb,

  cta_eyebrow text not null default '',
  cta_heading text not null default '',
  cta_body text not null default '',

  updated_at timestamptz not null default now()
);

alter table wopecartalks_content enable row level security;

create policy wopecartalks_content_public_select on wopecartalks_content
  for select to public
  using (true);

create policy wopecartalks_content_admin_all on wopecartalks_content
  for all to authenticated
  using (is_admin())
  with check (is_admin());

create table wopecartalks_episodes (
  id uuid primary key default gen_random_uuid(),
  episode_number integer,
  title text not null,
  -- Rich-text HTML show notes (WopeCarTalksEpisodeEditor uses the same
  -- RichTextEditor as the blog CMS) - guest bios, timestamps, links.
  description text not null default '',
  thumbnail_image text,
  duration_label text,
  -- Per-episode overrides of wopecartalks_content's channel URLs, for
  -- linking straight to this specific episode instead of the channel
  -- homepage once it has its own URL on each platform.
  youtube_url text,
  apple_url text,
  spotify_url text,
  is_published boolean not null default true,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger wopecartalks_episodes_set_updated_at
  before update on wopecartalks_episodes
  for each row execute function set_updated_at();

alter table wopecartalks_episodes enable row level security;

create policy wopecartalks_episodes_public_select on wopecartalks_episodes
  for select to public
  using (is_published = true);

create policy wopecartalks_episodes_admin_all on wopecartalks_episodes
  for all to authenticated
  using (is_admin())
  with check (is_admin());

insert into wopecartalks_content (
  hero_heading, hero_body, hero_image_url, hero_badge_top, hero_badge_bottom,
  listen_heading, listen_body,
  episodes_heading,
  why_heading, why_rows, quote_text, quote_image_url,
  stats_heading, stats,
  cta_eyebrow, cta_heading, cta_body
) values (
  E'WopeCarTalks — real stories from the road',
  E'Conversations with hosts, renters, and the people building mobility in Ghana. New episodes every two weeks — watch the full video on YouTube or listen wherever you get your podcasts.',
  '/assets/promo-video-thumb.jpg',
  '120+ episodes',
  '10K+ subscribers',
  E'Pick your platform — we''re on all three',
  'Full video episodes on YouTube, or audio-only wherever you already listen to podcasts.',
  'New conversations, every two weeks',
  'Stories from the people who move Ghana',
  '[
    {"icon_key": "chat", "title": "Real conversations", "body": "Unscripted chats with hosts, renters, and the WopeCar team — no corporate polish."},
    {"icon_key": "pin", "title": "Local guests, every episode", "body": "Hosts, renters, and partners from Accra, Kumasi, Takoradi, and Cape Coast."},
    {"icon_key": "shield-check", "title": "Practical, road-tested tips", "body": "Actionable advice on renting, hosting, and getting around Ghana — not filler."},
    {"icon_key": "calendar", "title": "New episode every two weeks", "body": "A steady drop schedule — video first on YouTube, audio everywhere else."}
  ]'::jsonb,
  E'We started WopeCarTalks because the best stories about mobility in Ghana were happening off-camera, in group chats and car rides. We just hit **record**.',
  '/assets/wopecare-support-web.jpg',
  'Growing with every episode',
  '[
    {"value": "120+", "label": "Episodes released"},
    {"value": "250K+", "label": "Total downloads"},
    {"value": "4.9★", "label": "Average rating"},
    {"value": "3", "label": "Platforms, one show"}
  ]'::jsonb,
  E'Don''t miss the next episode',
  'Subscribe on your platform of choice',
  'New episodes land every two weeks. Follow WopeCarTalks so you never miss one.'
);

insert into wopecartalks_episodes (episode_number, title, description, thumbnail_image, duration_label, published_at) values
  (24, 'Why We Built WopeCare', '<p>Inside the decision to launch WopeCar''s protection plan — and what it actually covers.</p>', '/assets/hero-fleet.jpg', '34 min', now()),
  (23, E'From Renter to Host: Ama''s Story', E'<p>How one weekend rental turned into a second income stream — and what she''d do differently.</p>', '/assets/why-photo.jpg', '28 min', now() - interval '14 days'),
  (22, 'Road Trip Guide: Accra to Cape Coast', '<p>Best stops, drive times, and which car to book for a coastal weekend away.</p>', '/assets/hero.jpg', '41 min', now() - interval '28 days');

-- Registers the page in the generic `pages` registry (slug/title/
-- meta_title/meta_desc/is_published) that the admin's Pages list and every
-- other singleton-content editor (share-your-car, who-we-are,
-- protection-plan) already uses for its "Published" toggle + SEO Metadata
-- card - same UI parity, even though (like those other pages) the
-- website's own page.tsx renders from wopecartalks_content directly and
-- doesn't consult this row's is_published at request time.
insert into pages (slug, title, meta_title, meta_desc, is_published)
values (
  'wopecartalks',
  'WopeCarTalks',
  'WopeCarTalks — The WopeCar Podcast',
  'Conversations with hosts, renters, and the people building mobility in Ghana. Watch on YouTube or listen on Apple Podcasts and Spotify.',
  true
)
on conflict (slug) do nothing;
