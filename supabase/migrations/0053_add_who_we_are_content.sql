-- "Who We Are" page (/who-we-are on the public website) - same treatment
-- as protection-plan (0049) and share-your-car (0050): a singleton content
-- table for real, admin-editable copy across many differently-shaped
-- sections, replacing the generic content_blocks stub row seeded by
-- 0032_seed_static_marketing_pages.sql (that row is now orphaned - the
-- real page no longer reads it - left in place rather than deleted, same
-- as protection-plan/share-your-car's predecessor stubs).
--
-- Testimonials aren't duplicated here - the page reuses the existing
-- testimonials table via getPublishedTestimonials() (general pool, not
-- filtered to source='partner' like Share Your Car), matching the
-- mockup's mixed renter/partner "WopeCar Stories" section.

create table who_we_are_content (
  id uuid primary key default gen_random_uuid(),

  hero_heading text not null default '',
  hero_body text not null default '',
  hero_image_url text,
  hero_badge_top text not null default '',
  hero_badge_bottom text not null default '',

  -- [{icon_key, title, body}] x4
  trust_items jsonb not null default '[]'::jsonb,

  story_eyebrow text not null default 'Our story',
  story_heading text not null default '',
  story_body_1 text not null default '',
  story_body_2 text not null default '',
  story_image_url text,

  why_eyebrow text not null default 'Our mission',
  why_heading text not null default '',
  -- [{icon_key, title, body}] x4
  why_rows jsonb not null default '[]'::jsonb,
  quote_text text not null default '',
  quote_image_url text,

  stats_eyebrow text not null default 'By the numbers',
  stats_heading text not null default '',
  -- [{value, label}] x4
  stats jsonb not null default '[]'::jsonb,

  team_eyebrow text not null default 'The people behind WopeCar',
  team_heading text not null default '',
  -- [{name, role, bio}] x4 - avatar is initials derived from name client-side, no photo
  team_members jsonb not null default '[]'::jsonb,

  testi_eyebrow text not null default 'WopeCar Stories',
  testi_heading text not null default '',

  cta_eyebrow text not null default '',
  cta_heading text not null default '',
  cta_body text not null default '',
  cta_primary_label text not null default '',
  cta_secondary_label text not null default '',

  updated_at timestamptz not null default now()
);

alter table who_we_are_content enable row level security;

create policy who_we_are_content_public_select on who_we_are_content
  for select to anon, authenticated
  using (true);

create policy who_we_are_content_admin_all on who_we_are_content
  for all to authenticated
  using (is_admin())
  with check (is_admin());

insert into who_we_are_content (
  hero_heading, hero_body, hero_image_url, hero_badge_top, hero_badge_bottom,
  trust_items,
  story_heading, story_body_1, story_body_2, story_image_url,
  why_heading, why_rows, quote_text, quote_image_url,
  stats_heading, stats,
  team_heading, team_members,
  testi_heading,
  cta_eyebrow, cta_heading, cta_body, cta_primary_label, cta_secondary_label
) values (
  'Built for the way Ghana moves',
  E'WopeCar connects trusted local car partners with renters across Accra, Kumasi, Takoradi, and Cape Coast — making a reliable ride just a few taps away, and a parked car a source of steady income.',
  '/assets/hero.jpg',
  'Est. 2019',
  '4 cities, growing',
  '[
    {"icon_key": "shield", "title": "Verified partners", "body": "Every host is ID-verified before their car goes live."},
    {"icon_key": "calendar", "title": "Secure payments", "body": "Funds are only released after pickup, every time."},
    {"icon_key": "clock", "title": "Local support", "body": "A Ghana-based team, reachable when it matters."},
    {"icon_key": "pin", "title": "Nationwide coverage", "body": "Pickup points in Accra, Kumasi, Takoradi & Cape Coast."}
  ]'::jsonb,
  E'From one car in Osu to a nationwide network',
  E'WopeCar started in 2019 when our founders couldn''t find a reliable car to rent for a weekend trip to Cape Coast — every option was either unverified, overpriced, or both. So they borrowed a friend''s Corolla, listed it themselves, and WopeCar was born.',
  E'Since then we''ve grown into a trusted marketplace connecting thousands of renters with verified local car partners — handling the verification, payments, and support so both sides can focus on the road ahead.',
  '/assets/hero-fleet.jpg',
  'Making trustworthy car rental the easy choice',
  '[
    {"icon_key": "shield", "title": "Trust, verified", "body": "Every partner and renter goes through ID verification before their first trip."},
    {"icon_key": "plus", "title": "Fair, transparent pricing", "body": "The price you see is the price you pay — no hidden fees at pickup."},
    {"icon_key": "pin", "title": "Built for Ghana", "body": "Local pickup points, Ghana Card verification, and cedi pricing from day one."},
    {"icon_key": "clock", "title": "People-powered", "body": "Real support from a team that knows the roads and the people driving them."}
  ]'::jsonb,
  E'We built WopeCar because getting a reliable car — or a reliable **income** from your own — shouldn''t take all day.',
  '/assets/why-photo.jpg',
  'Growing with Ghana',
  '[
    {"value": "2019", "label": "Founded"},
    {"value": "4", "label": "Cities served"},
    {"value": "1,800+", "label": "Verified cars"},
    {"value": "50,000+", "label": "Trips completed"}
  ]'::jsonb,
  'Meet the team',
  '[
    {"name": "Ama Owusu", "role": "Co-founder & CEO", "bio": "Leads product and partnerships, and still answers support tickets on weekends."},
    {"name": "Kwesi Boateng", "role": "Co-founder & COO", "bio": "Runs day-to-day operations across all four cities WopeCar serves."},
    {"name": "Linda Mensah", "role": "Head of Trust & Safety", "bio": "Built the verification process that keeps every trip on WopeCar secure."},
    {"name": "Kojo Asante", "role": "Head of Partner Success", "bio": "Helps car owners list, price, and grow their earnings on the platform."}
  ]'::jsonb,
  'What our community has to say',
  'Two ways to be part of WopeCar',
  'Ready to hit the road?',
  'Browse verified cars near you, or put your own car to work and start earning.',
  'Browse cars',
  'Share your car'
);
