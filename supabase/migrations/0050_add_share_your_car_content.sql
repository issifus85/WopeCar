-- "Share Your Car" page (/share-your-car on the public website, "For car
-- owners" in the footer) - same treatment as protection-plan (migration
-- 0049): real structured content across many sections, too much for
-- content_blocks' generic {heading, body} shape, so it gets its own
-- singleton content table plus reuse of two EXISTING systems rather than
-- inventing parallel ones for testimonials and FAQs.

create table share_your_car_content (
  id uuid primary key default gen_random_uuid(),

  hero_eyebrow text not null default 'For car owners',
  hero_heading text not null default '',
  hero_body text not null default '',
  hero_image_url text,
  hero_badge_top text not null default '',
  hero_badge_bottom text not null default '',
  hero_cta_primary_label text not null default 'Get started',
  hero_cta_secondary_label text not null default 'See how it works',

  -- [{icon_key, value, label}] x4 (avg earnings / time to first booking / insurance / payout cadence)
  host_stats jsonb not null default '[]'::jsonb,

  how_eyebrow text not null default 'How it works',
  how_heading text not null default '',
  -- [{title, body}] x4 - numbered 1-4 by array position on the site, not stored
  how_steps jsonb not null default '[]'::jsonb,

  earn_eyebrow text not null default 'Estimate your earnings',
  earn_heading text not null default '',
  -- [{class_key, class_label, daily_rate, monthly_range}] x4
  earn_cards jsonb not null default '[]'::jsonb,
  earn_note text not null default '',

  elig_eyebrow text not null default 'Is your car eligible?',
  elig_heading text not null default '',
  -- string[] x5
  elig_checklist jsonb not null default '[]'::jsonb,
  elig_note text not null default '',
  elig_image_url text,

  why_eyebrow text not null default 'Support & protection',
  why_heading text not null default '',
  -- [{icon_key, title, body}] x4
  why_rows jsonb not null default '[]'::jsonb,
  quote_text text not null default '',
  quote_image_url text,

  testi_eyebrow text not null default 'Partner stories',
  testi_heading text not null default '',
  testi_cta_label text not null default 'Share your story',

  faq_eyebrow text not null default 'Questions',
  faq_heading text not null default '',

  cta_eyebrow text not null default 'For car owners',
  cta_heading text not null default '',
  cta_body text not null default '',
  cta_button_label text not null default '',
  cta_reassure text not null default '',

  updated_at timestamptz not null default now()
);

alter table share_your_car_content enable row level security;

create policy share_your_car_content_public_select on share_your_car_content
  for select to anon, authenticated
  using (true);

create policy share_your_car_content_admin_all on share_your_car_content
  for all to authenticated
  using (is_admin())
  with check (is_admin());

insert into share_your_car_content (
  hero_heading, hero_body, hero_image_url, hero_badge_top, hero_badge_bottom,
  host_stats,
  how_heading, how_steps,
  earn_heading, earn_cards, earn_note,
  elig_heading, elig_checklist, elig_note, elig_image_url,
  why_heading, why_rows, quote_text, quote_image_url,
  testi_heading,
  faq_heading,
  cta_heading, cta_body, cta_button_label, cta_reassure
) values (
  E'Share your car. Earn every time it''s parked.',
  E'List your car on WopeCar and earn steady income while we handle bookings, payments, and verified renters — you stay in control of your calendar and price.',
  '/assets/share-your-car-hero.jpg',
  'GH₵ 3,200/mo avg. earnings',
  'Insurance included',
  '[
    {"icon_key": "plus", "value": "GH₵ 3,200/mo", "label": "Avg. host earnings"},
    {"icon_key": "clock", "value": "~4 days", "label": "Time to first booking"},
    {"icon_key": "shield", "value": "Included", "label": "Insurance"},
    {"icon_key": "calendar", "value": "Weekly", "label": "Direct payout"}
  ]'::jsonb,
  'Four steps to your first booking',
  '[
    {"title": "List your car", "body": "Add photos, set your price and availability in minutes."},
    {"title": "Get verified", "body": "We verify your ID and vehicle documents — usually within 48 hours."},
    {"title": "Get booked", "body": "Verified renters book and pay through the app; you approve trip requests."},
    {"title": "Get paid", "body": "Payouts land in your account weekly, direct — no chasing renters for cash."}
  ]'::jsonb,
  'What owners typically earn, by category',
  '[
    {"class_key": "economy", "class_label": "Economy", "daily_rate": "GH₵ 180/day", "monthly_range": "GH₵ 2,000–2,800"},
    {"class_key": "comfort", "class_label": "Comfort", "daily_rate": "GH₵ 260/day", "monthly_range": "GH₵ 2,800–3,600"},
    {"class_key": "suv", "class_label": "SUV", "daily_rate": "GH₵ 340/day", "monthly_range": "GH₵ 3,400–4,500"},
    {"class_key": "luxury", "class_label": "Luxury", "daily_rate": "GH₵ 520/day", "monthly_range": "GH₵ 5,000+"}
  ]'::jsonb,
  'Estimates based on typical booking frequency in Accra. Actual earnings vary by city, car condition, and availability.',
  E'Most cars qualify — here''s what we check',
  '[
    "2013 model year or newer",
    "Valid Ghana roadworthy certificate",
    "Comprehensive insurance, or WopeCar''s partner insurance",
    "Clean title, no active loan restrictions on rental use",
    "Passes a quick WopeCar safety inspection"
  ]'::jsonb,
  'Most sedans, SUVs, and vans from 2013 onward qualify. Luxury and commercial vehicles may need additional documentation — our partner success team can walk you through it.',
  '/assets/hero-fleet.jpg',
  'You share the car — we handle the rest',
  '[
    {"icon_key": "shield", "title": "Insurance included", "body": "Every approved trip is covered under WopeCar''s partner insurance."},
    {"icon_key": "clock", "title": "24/7 partner support", "body": "A local team is reachable for anything that comes up mid-trip."},
    {"icon_key": "lock", "title": "Fraud & damage protection", "body": "Verified renters, trip photos, and a claims process that has your back."},
    {"icon_key": "calendar", "title": "Flexible, weekly payouts", "body": "Money moves to your mobile money or bank account, direct."}
  ]'::jsonb,
  'Weekly payouts, no chasing renters for cash. It just **works**.',
  '/assets/promo-video-thumb.jpg',
  'Hear from WopeCar hosts',
  'Frequently asked questions',
  'Start earning from your car today',
  E'Join WopeCar''s network of trusted partners across Ghana. Listing takes about 10 minutes and there are no upfront fees.',
  E'Share your car — it''s free',
  'No listing fees. You control price, availability, and every trip request.'
);

-- Testimonials: add fields the "Share Your Car" partner-story cards need
-- (host location) and that a moderation workflow needs (an optional way
-- to follow up with whoever submitted one, never shown on the site).
alter table testimonials add column if not exists location text;
alter table testimonials add column if not exists contact_email text;

-- Public submission (the mockup's "Share your story" CTA) - forced to
-- is_published = false regardless of what the client sends, same
-- "constrain at the WITH CHECK, don't just trust the client" spirit as
-- the rest of this schema's anon-insert policies, so a submitted story
-- always lands in the admin moderation queue rather than going live
-- unreviewed.
create policy testimonials_public_insert on testimonials
  for insert to anon
  with check (is_published = false);
