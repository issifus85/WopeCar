-- The Share Your Car page's "Share your story" CTA (migration 0050) lets a
-- host submit a testimonial that lands unpublished in the admin moderation
-- queue. That needs its own source value, distinct from 'manual' (admin-
-- curated) and 'google'/'app', so the admin list and the site's testimonial
-- carousel can tell partner-submitted stories apart from the rest.
alter table testimonials drop constraint testimonials_source_check;
alter table testimonials add constraint testimonials_source_check
  check (source = any (array['google', 'app', 'manual', 'partner']));

-- Seed the Share Your Car page's FAQ section into the existing FAQ system
-- (category='vendor' was already a supported option in the admin's FaqModal
-- dropdown, just unused until now) rather than storing FAQ copy on
-- share_your_car_content itself - keeps one editing surface for all FAQs.
insert into faqs (question, answer, category, position, is_published) values
  ('How much can I earn?', E'It depends on your car''s category and demand in your city. Economy sedans typically average GH₵2,000–2,800/month, while SUVs and luxury cars often earn more.', 'vendor', 19, true),
  ('Is my car insured while it''s rented?', E'Yes — WopeCar''s partner insurance covers every approved trip from pickup to return.', 'vendor', 20, true),
  ('How do I get paid?', 'Payouts are sent weekly, directly to your mobile money or bank account — no invoicing needed.', 'vendor', 21, true),
  ('Can I set my own price and availability?', 'Yes — you control your calendar, your pricing, and which trip requests you accept or decline.', 'vendor', 22, true),
  ('What if my car is damaged during a trip?', 'Report it through the app within 24 hours of drop-off — our claims team handles the rest under your protection plan.', 'vendor', 23, true);

-- Seed the 3 host stories from the Share Your Car mockup as real,
-- already-published partner testimonials (source='partner') so the page's
-- carousel isn't empty at launch - editable/removable via the new admin
-- testimonials moderation page like any other row.
insert into testimonials (author_name, review, rating, source, location, is_published, is_featured) values
  ('Yaw Mensah', E'My Corolla was sitting idle most weekdays. Now it earns more than my old side job did — and it''s basically passive income.', 5, 'partner', 'Osu', true, false),
  ('Efua Boateng', 'The verification process was quick and the support team actually answers the phone when something comes up.', 5, 'partner', 'East Legon', true, false),
  ('Kwabena Owusu', 'Weekly payouts straight to my mobile money, no chasing renters for cash. It just works.', 5, 'partner', 'Kumasi', true, false);
