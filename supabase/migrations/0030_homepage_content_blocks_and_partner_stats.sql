-- content_blocks had a public_select policy but no admin write policy
-- (pages already had both) - the admin dashboard couldn't have edited these
-- rows even once populated. Mirrors pages_admin_all's is_admin() check.
create policy content_blocks_admin_all on content_blocks
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- The original type enum ('hero','text','image','faq','testimonial',
-- 'cars_grid') was scaffolded for a generic page builder that was never
-- built out - the table had 0 rows. Widening rather than repurposing an
-- existing type keeps `type` a clean, filterable discriminator for the
-- homepage's actual block shapes instead of overloading 'text' with a
-- second hidden discriminator inside `data`.
alter table content_blocks drop constraint content_blocks_type_check;
alter table content_blocks add constraint content_blocks_type_check
  check (type = any (array['hero','text','image','faq','testimonial','cars_grid',
    'trust_item','how_it_works_step','why_wopecar_row','quote']));

-- Seed the 'home' page + its content blocks with the exact copy that was
-- previously hardcoded in wopecar-website/app/page.tsx (How it works, Why
-- WopeCar, trust strip, single quote) - the site is being switched over to
-- read these live so an admin can edit copy without a code deploy, but the
-- initial values must match what's already published so the switch is a
-- no-op visually.
insert into pages (slug, title, is_published)
values ('home', 'Homepage', true)
on conflict (slug) do nothing;

with home as (select id from pages where slug = 'home')
insert into content_blocks (page_id, type, position, data, is_visible)
select home.id, v.type, v.position, v.data, true
from home, (values
  ('trust_item', 0, '{"title":"Verified hosts","subtitle":"ID and vehicle checks"}'::jsonb),
  ('trust_item', 1, '{"title":"Secure payments","subtitle":"Pay safely online"}'::jsonb),
  ('trust_item', 2, '{"title":"Insured trips","subtitle":"Covered from pickup to drop-off"}'::jsonb),
  ('trust_item', 3, '{"title":"24/7 support","subtitle":"Help whenever you need it"}'::jsonb),
  ('how_it_works_step', 0, '{"title":"Search & compare","body":"Filter by location, dates, and vehicle type to find a car that fits your trip."}'::jsonb),
  ('how_it_works_step', 1, '{"title":"Book securely","body":"Reserve online and pay safely through WopeCar — no cash handovers needed."}'::jsonb),
  ('how_it_works_step', 2, '{"title":"Get confirmation","body":"Booking confirmed by WopeCar with delivery or pickup details."}'::jsonb),
  ('how_it_works_step', 3, '{"title":"Enjoy your trip","body":"Freedom to go places — with 24/7 support when you need it."}'::jsonb),
  ('why_wopecar_row', 0, '{"title":"Verified partners and patrons","body":"Every host and vehicle is checked before it goes live."}'::jsonb),
  ('why_wopecar_row', 1, '{"title":"Secure, flexible payments","body":"Pay online with confidence — funds are only released after pickup."}'::jsonb),
  ('why_wopecar_row', 2, '{"title":"Real support, when you need it","body":"A local team is reachable for anything that comes up on your trip."}'::jsonb),
  ('why_wopecar_row', 3, '{"title":"Transparent pricing","body":"The price you see includes what you pay — no surprise fees at pickup."}'::jsonb),
  ('quote', 0, '{"text":"Every client and partner shares in our goal of a reliable and convenient service with top-notch customer support."}'::jsonb)
) as v(type, position, data);

-- Partner-CTA stats (app/page.tsx's "For car owners" panel). Avg host
-- earnings and time-to-first-booking are *computable* from real
-- bookings/vendors data (see wopecar-website's lib/data/partnerStats.ts),
-- but as of this migration only 3 of 53 approved vendors have ever had a
-- paid booking - a live average over that would show a misleadingly tiny
-- number, not an honest "not enough data yet" state. These two keys are the
-- floor: partnerStats.ts falls back to them until enough real vendors have
-- paid bookings to compute a trustworthy average, at which point it
-- switches over automatically. Insurance/payout aren't computable metrics
-- at all (they're policy statements), so they stay admin-edited text
-- permanently, same as support_email/support_address above.
insert into app_settings (key, value, description) values
  ('partner_stat_avg_earnings_ghs', '3200', 'Fallback "Avg. host earnings/mo" shown on the website until enough vendors have real paid bookings to compute a live average'),
  ('partner_stat_days_to_first_booking', '4', 'Fallback "Time to first booking" (days) shown on the website until enough vendors have real paid bookings to compute a live average'),
  ('partner_stat_insurance_text', '"Included"', 'Website partner-CTA "Insurance" value - a policy statement, not a computed stat'),
  ('partner_stat_payout_text', '"Bi-weekly or monthly, direct to host"', 'Website partner-CTA "Payout" value - a policy statement, not a computed stat')
on conflict (key) do nothing;
