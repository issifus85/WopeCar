-- WopeCare Protection Plan page (/protection-plan on the public website) -
-- previously just the generic bare heading+body stub every other static
-- page uses. This page has real structured content (hero, 3 pricing tiers,
-- a worked example, a benefits band, an info section, a CTA), so it gets
-- its own tables rather than trying to force that shape into
-- content_blocks' generic {heading, body} rows.
--
-- protection_plan_tiers: the 3 packages (Basic/Plus/Premium) - explicitly
-- admin-editable per product requirement. rate_percentage/coverage_amount
-- drive the "Example on a GH₵X/day car" text and the worked-example
-- scenarios on the website, computed at render time rather than stored as
-- separate text, so they can never drift out of sync with the real numbers.
create table protection_plan_tiers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tier_label text not null,
  rate_percentage numeric not null,
  coverage_amount numeric not null,
  is_featured boolean not null default false,
  badge_label text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index protection_plan_tiers_position_idx on protection_plan_tiers(position);

alter table protection_plan_tiers enable row level security;

create policy protection_plan_tiers_public_select on protection_plan_tiers
  for select to anon, authenticated
  using (true);

create policy protection_plan_tiers_admin_all on protection_plan_tiers
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- protection_plan_content: singleton row (same pattern as homepage_campaign)
-- holding every other section's editable copy. A few fields on the website
-- side are deliberately NOT stored here because they're derived from the
-- tiers above at render time (e.g. the hero's "Up to GHx coverage" badge
-- uses the highest coverage_amount, and the How It Works lead sentence
-- names whichever tier has is_featured=true) - keeping those computed
-- means they can't silently drift out of sync with the real pricing.
create table protection_plan_content (
  id uuid primary key default gen_random_uuid(),

  hero_eyebrow text not null default 'WopeCare Protection',
  hero_heading text not null default 'Less worry about the unexpected',
  hero_body text not null default '',
  hero_image_url text,
  hero_badge_top text not null default 'Optional add-on',
  hero_cta_label text not null default 'See How It Works',

  plans_eyebrow text not null default 'Protection plans',
  plans_heading text not null default '',
  plans_body text not null default '',
  plans_note text not null default '',
  sample_day_rate numeric not null default 145,

  how_eyebrow text not null default 'How it works',
  how_heading text not null default 'How WopeCare works',
  how_body text not null default '',
  how_image_url text,
  scenario_a_damage numeric not null default 1500,
  scenario_b_damage numeric not null default 4000,
  how_footnote text not null default '',

  why_eyebrow text not null default 'Why WopeCare',
  why_heading text not null default '',
  why_rows jsonb not null default '[]'::jsonb,
  quote_text text not null default '',
  quote_image_url text,

  info_eyebrow text not null default 'Important information',
  info_heading text not null default 'Important information',
  info_intro_1 text not null default '',
  info_intro_2 text not null default '',
  info_list jsonb not null default '[]'::jsonb,
  info_closing text not null default '',

  cta_eyebrow text not null default 'Ready when you are',
  cta_heading text not null default '',
  cta_body text not null default '',
  cta_button_label text not null default 'Browse Cars',
  fine_print text not null default '',

  updated_at timestamptz not null default now()
);

alter table protection_plan_content enable row level security;

create policy protection_plan_content_public_select on protection_plan_content
  for select to anon, authenticated
  using (true);

create policy protection_plan_content_admin_all on protection_plan_content
  for all to authenticated
  using (is_admin())
  with check (is_admin());

insert into protection_plan_tiers (name, tier_label, rate_percentage, coverage_amount, is_featured, badge_label, position) values
  ('Basic', 'Essential Protection', 8, 1500, false, null, 0),
  ('Plus', 'Balanced Protection', 12, 3000, true, 'Most popular', 1),
  ('Premium', 'Maximum Protection', 16, 5000, false, null, 2);

insert into protection_plan_content (
  hero_body, hero_image_url,
  plans_heading, plans_body, plans_note,
  how_body, how_image_url, how_footnote,
  why_heading, why_rows, quote_text, quote_image_url,
  info_intro_1, info_intro_2, info_list, info_closing,
  cta_heading, cta_body, fine_print
) values (
  E'When you rent with WopeCar, you''re responsible for any damage to the vehicle during your trip. Add WopeCare and get protection toward eligible incidental damage — scratches, scuffs, minor dents and more — so you can drive with confidence.',
  '/assets/wopecare-hero-web.jpg',
  E'Choose the protection that''s right for you',
  E'WopeCare is calculated based on your vehicle''s daily rental rate and covers you for the full duration of your booking.',
  'Pricing shown is calculated automatically based on your selected vehicle when you book.',
  'If eligible incidental damage occurs during your rental, WopeCare covers the repair cost up to your selected plan limit. Simple, transparent, no surprises.',
  '/assets/wopecare-support-web.jpg',
  'Your WopeCare benefit is the maximum total available for eligible damage across your entire rental period.',
  'Peace of mind, built into every booking',
  '[
    {"icon_key": "document", "title": "Simple & transparent", "body": "No surprises — your protection plan cost is shown before you pay."},
    {"icon_key": "shield", "title": "Fast, easy protection", "body": "Eligible damage is covered up to your selected plan limit — no drawn-out disputes."},
    {"icon_key": "plus", "title": "Priced to your trip", "body": "Calculated as a percentage of your car''s daily rate, so it scales with your booking."},
    {"icon_key": "circle-check", "title": "Optional, your choice", "body": "Add WopeCare at checkout, or skip it — no pressure either way."}
  ]'::jsonb,
  'Scratched the bumper backing out of a tight spot in Kumasi. WopeCare covered it — no stress, no **argument**.',
  '/assets/wopecare-quote-web.jpg',
  'WopeCare is an optional vehicle damage protection product and is not insurance.',
  'You remain responsible for the rental vehicle and for all damage occurring during your rental period. WopeCare provides a benefit toward eligible incidental damage up to the maximum amount included in your selected plan.',
  '["Damage exceeding your WopeCare benefit", "Damage not eligible under WopeCare", "All other obligations under your Rental Agreement"]'::jsonb,
  'WopeCare protection applies to one rental only and cannot be purchased after your rental has begun.',
  'Ready to book with confidence?',
  E'Browse our fleet and add WopeCare at checkout — your protection plan cost is shown before you pay.',
  'See WopeCare Terms & Conditions for complete details. WopeCare is subject to eligibility review by WopeCar.'
);
