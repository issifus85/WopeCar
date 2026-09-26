-- "Buy a Car" page (wopecar.com/buy-a-car) - WopeCar Sales, a certified
-- pre-owned car marketplace distinct from the rental fleet. Added to the top
-- nav (after Airport Pickup) and the footer (under Share Your Car) per the
-- request. Auctions (live bidding on retiring fleet vehicles) is
-- deliberately NOT part of this build - it's a genuinely separate system
-- (bid tracking, outbid notices, payment-on-win) scoped out for now.
--
-- Same singleton-content-table + real-listings-table split as careers
-- (migration 0101): too much structured content for content_blocks'
-- generic {heading, body} shape, and the car listings are real admin-CRUD
-- data (car_sale_listings), not hardcoded HTML.
--
-- FAQs reuse the site's existing shared `faqs` table (category column) the
-- same way share-your-car already does with category='vendor' - see
-- lib/api/faqs.ts (admin) and lib/data/faqs.ts (website) for the
-- 'car-sales' category addition, no new table needed for those.

create table car_sales_content (
  id uuid primary key default gen_random_uuid(),

  hero_eyebrow text not null default 'WopeCar Sales',
  hero_heading text not null default '',
  hero_body text not null default '',
  hero_cta_primary_label text not null default 'Browse Cars For Sale',
  hero_cta_secondary_label text not null default 'How Buying Works',
  hero_microcopy text not null default '',
  hero_badge_top text not null default '',
  hero_badge_bottom text not null default '',
  hero_image_url text,

  -- [{icon_key, title, body}] x4
  trust_items jsonb not null default '[]'::jsonb,

  forsale_eyebrow text not null default 'Certified pre-owned',
  forsale_heading text not null default '',
  forsale_body text not null default '',

  why_eyebrow text not null default 'Why buy from WopeCar',
  why_heading text not null default '',
  -- [{icon_key, title, body}] x4
  why_rows jsonb not null default '[]'::jsonb,
  why_quote_text text not null default '',
  why_quote_image_url text,

  faq_eyebrow text not null default 'Questions',
  faq_heading text not null default '',

  cta_eyebrow text not null default 'Ready when you are',
  cta_heading text not null default '',
  cta_body text not null default '',
  cta_button_label text not null default 'Browse Cars For Sale',

  updated_at timestamptz not null default now()
);

alter table car_sales_content enable row level security;

create policy car_sales_content_public_select on car_sales_content
  for select to anon, authenticated
  using (true);

create policy car_sales_content_admin_all on car_sales_content
  for all to authenticated
  using (is_admin())
  with check (is_admin());

insert into car_sales_content (
  hero_heading, hero_body, hero_microcopy, hero_badge_top, hero_badge_bottom, hero_image_url,
  trust_items,
  forsale_heading, forsale_body,
  why_heading, why_rows, why_quote_text, why_quote_image_url,
  faq_heading,
  cta_heading, cta_body
) values (
  'Own your next car, certified and ready to drive',
  'Browse certified pre-owned vehicles from the WopeCar marketplace. Every listing is inspected, history-checked, and priced transparently - no haggling, no surprises.',
  '150+ WopeCar vehicles sold to Ghanaian drivers',
  '150-point inspected',
  'Certified before every sale',
  '/assets/hero-fleet.jpg',
  '[
    {"icon_key": "shield", "title": "Certified inspection", "body": "150-point check before every sale."},
    {"icon_key": "document", "title": "Full history report", "body": "Accident & service records included."},
    {"icon_key": "warranty", "title": "90-day warranty", "body": "Covered on all certified vehicles."},
    {"icon_key": "card", "title": "Flexible financing", "body": "Partner banks & payment plans."}
  ]'::jsonb,
  'Cars for sale, ready to drive',
  E'Every vehicle below has passed WopeCar\'s certified inspection and comes with a full service history.',
  'Buy with confidence, not guesswork',
  '[
    {"icon_key": "shield", "title": "Certified inspection", "body": "Every car passes a 150-point mechanical and safety check before listing."},
    {"icon_key": "document", "title": "Transparent history", "body": "Full service and accident history included with every listing."},
    {"icon_key": "warranty", "title": "90-day warranty", "body": "Certified pre-owned vehicles are covered for 90 days or 5,000 km."},
    {"icon_key": "support", "title": "Real support", "body": "A Ghana-based team to help with financing, paperwork, and test drives."}
  ]'::jsonb,
  E'We know these cars because we\'ve maintained them ourselves - that\'s the confidence we\'re selling, not just the car.',
  '/assets/wopecare-support-web.jpg',
  'Buying FAQs',
  'Find your next car today',
  'Browse certified listings below, or get in touch and our team will help you find the right car.'
);

create table car_sale_listings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  badge_label text not null default 'Certified Pre-Owned',
  -- 'cpo' | 'luxury' - controls the badge's colour treatment on the site.
  badge_style text not null default 'cpo',
  image_url text,
  rating numeric(2,1),
  location text not null default '',
  transmission text not null default 'Automatic',
  mileage_km integer,
  price numeric not null default 0,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index car_sale_listings_active_idx on car_sale_listings(is_active);

alter table car_sale_listings enable row level security;

create policy car_sale_listings_public_select on car_sale_listings
  for select to anon, authenticated
  using (is_active = true);

create policy car_sale_listings_admin_all on car_sale_listings
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- Two temporary example listings, fully editable/replaceable in the admin -
-- reuse the site's existing category illustration assets rather than
-- fabricated stock photos, same as every other page's placeholder imagery.
insert into car_sale_listings (name, badge_label, badge_style, image_url, rating, location, transmission, mileage_km, price, sort_order) values
  ('2019 Toyota Corolla', 'Certified Pre-Owned', 'cpo', '/assets/categories/sedan.png', 4.8, 'Airport Residential, Accra', 'Automatic', 52000, 145000, 0),
  ('2020 Hyundai Tucson', 'Certified Pre-Owned', 'cpo', '/assets/categories/midsize_suv.png', 4.9, 'Ahodwo, Kumasi', 'Automatic', 38500, 210000, 1);

insert into pages (slug, title, meta_title, meta_desc, is_published)
values (
  'buy-a-car',
  'Buy a Car',
  'Buy a Certified Pre-Owned Car in Ghana | WopeCar Sales',
  'Browse certified pre-owned vehicles from WopeCar. Every listing is inspected, history-checked, and priced transparently - no haggling, no surprises.',
  true
)
on conflict (slug) do nothing;
