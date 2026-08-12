-- The Who We Are page's bottom CTA buttons ("Browse cars" / "Share your car")
-- had their destination hrefs hardcoded in app/who-we-are/page.tsx
-- (/book-a-car and /share-your-car) with no backend field to edit them -
-- add the missing url columns, seeded to those same two existing routes.

alter table who_we_are_content
  add column cta_primary_url text not null default '/book-a-car',
  add column cta_secondary_url text not null default '/share-your-car';
