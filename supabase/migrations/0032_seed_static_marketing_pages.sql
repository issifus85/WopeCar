-- Seeds pages/content_blocks for the 11 static marketing pages that were
-- hardcoded JSX in wopecar-website (everything except '/' [already CMS-
-- managed as of migration 0030], car detail, /book-a-car, /regions [both
-- data-driven from cars/regions, not editorial copy], /blog, /faq -
-- explicitly out of scope per the admin's own request). Values below are
-- copied verbatim from each page's current hardcoded <h1>/<p> and
-- generateMetadata() call so switching the site over to read these live is
-- a no-op visually. A couple of pages had an inline link inside the body
-- paragraph (host-insurance -> /faq, earnings-calculator -> /share-your-car,
-- etc.) - flattened to plain text since the admin body field is plain
-- text, not rich text; who-we-are's <address> block stays hardcoded in the
-- page (it's already sourced from lib/seo/constants.ts, not editorial copy).
insert into pages (slug, title, meta_title, meta_desc, is_published) values
  ('airport-pickup', 'Airport Pickup in Accra', 'Airport Pickup in Accra | WopeCar Ghana', 'Book a reliable car and driver for pickup from Kotoka International Airport with WopeCar.', true),
  ('earnings-calculator', 'Earnings Calculator', 'Earnings Calculator | WopeCar Ghana', 'Estimate what your car could earn on WopeCar.', true),
  ('eligibility', 'Eligibility Requirements', 'Eligibility Requirements | WopeCar Ghana', 'What you need to book a car on WopeCar.', true),
  ('host-insurance', 'Insurance for Hosts', 'Host Insurance | WopeCar Ghana', 'How coverage works for hosts renting out a car on WopeCar.', true),
  ('host-resources', 'Host Resources', 'Host Resources | WopeCar Ghana', 'Guides and tools for WopeCar hosts listing a car for rent.', true),
  ('privacy', 'Privacy Policy', 'Privacy Policy | WopeCar Ghana', 'WopeCar''s privacy policy.', true),
  ('protection-plan', 'Protection Plan', 'Protection Plan | WopeCar Ghana', 'What coverage looks like on a WopeCar booking, from pickup to drop-off.', true),
  ('share-your-car', 'Share Your Car', 'Share Your Car | Become a WopeCar Host', 'List your car on WopeCar and earn money renting it out to verified renters across Ghana.', true),
  ('terms', 'Terms of Service', 'Terms of Service | WopeCar Ghana', 'WopeCar''s terms of service.', true),
  ('trust-safety', 'Trust & Safety', 'Trust & Safety | WopeCar Ghana', 'How WopeCar screens hosts and vehicles, and what to expect on every trip.', true),
  ('who-we-are', 'Who We Are', 'Who We Are | WopeCar Ghana', 'WopeCar is Ghana''s leading online car rental marketplace, connecting hosts and renters for self-drive and chauffeured trips across the country.', true)
on conflict (slug) do nothing;

with page_body as (
  select slug, heading, body from (values
    ('airport-pickup', 'Airport Pickup in Accra', 'Book a car and driver to meet you at Kotoka International Airport — arranged in advance, ready when you land.'),
    ('earnings-calculator', 'Earnings Calculator', 'Want an estimate for your specific car? Share your car and the WopeCar team will follow up with real numbers based on your vehicle and location.'),
    ('eligibility', 'Eligibility Requirements', 'You''ll need a valid driver''s license to book a self-drive rental on WopeCar. Specific requirements can vary by car and host — check the listing or ask via support before booking.'),
    ('host-insurance', 'Insurance for Hosts', 'Your vehicle is covered while it''s out on a WopeCar booking. For coverage details specific to your car, contact support.'),
    ('host-resources', 'Host Resources', 'Everything you need to list and manage a car on WopeCar. Ready to get started? Visit Share your car.'),
    ('privacy', 'Privacy Policy', 'This page is a placeholder — the full Privacy Policy text will be published here.'),
    ('protection-plan', 'Protection Plan', 'WopeCar bookings are covered from pickup to drop-off. For the specifics on any particular car — including its security deposit and cancellation terms — check that car''s listing, or reach out to support before you book.'),
    ('share-your-car', 'Share Your Car', 'List your car on WopeCar and start earning from bookings — self-drive or with your own driver.'),
    ('terms', 'Terms of Service', 'This page is a placeholder — the full Terms of Service text will be published here.'),
    ('trust-safety', 'Trust & Safety', 'Every car on WopeCar comes from a vetted host, and every booking runs through WopeCar rather than a direct cash handover — so there''s always a real support team behind your trip if something needs sorting out.'),
    ('who-we-are', 'Who We Are', 'WopeCar is Ghana''s leading online car rental marketplace. Hosts list their cars, renters book them — self-drive or with a driver — for everything from airport pickups to long-term corporate and tourism rentals.')
  ) as v(slug, heading, body)
)
insert into content_blocks (page_id, type, position, data, is_visible)
select p.id, 'text', 0, jsonb_build_object('heading', pb.heading, 'body', pb.body), true
from page_body pb
join pages p on p.slug = pb.slug
where not exists (
  select 1 from content_blocks cb where cb.page_id = p.id and cb.type = 'text'
);
