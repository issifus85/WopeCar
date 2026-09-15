-- Airport Pickup page (/airport-pickup on the public website, added to
-- main nav and the "For renters" footer column) - same treatment as
-- share-your-car (migration 0050): real structured content across many
-- sections, too much for content_blocks' generic {heading, body} shape,
-- so it gets its own singleton content table. The page previously existed
-- only as a generic content_blocks stub (pages.slug='airport-pickup',
-- type='text') - that pages row is kept (still carries meta_title/
-- meta_desc/is_published, same as share-your-car's own pages row), but
-- its content_blocks row is now orphaned/unused now that the page reads
-- from airport_pickup_content instead.
--
-- Unlike share-your-car, this page also needs a REAL persisted booking
-- form (the HTML mockup this was built from only faked a client-side
-- "success" state with no backend at all) - airport_pickup_requests
-- mirrors booking_inquiries' exact RLS shape (migration 0022): anon
-- insert-only, admin full CRUD, a notified_at idempotency guard for its
-- notification Edge Function. Kept as its own dedicated table rather than
-- overloading booking_inquiries because the two have real shape
-- differences (flight/airport/passenger fields here, a genuine status
-- lifecycle of pending/confirmed/completed/cancelled rather than
-- inquiries' new/contacted/converted/closed) and because a booking_ref
-- is meaningful here (shown to the requester as their reference) but
-- inquiries have never needed one.

create table airport_pickup_content (
  id uuid primary key default gen_random_uuid(),

  hero_eyebrow text not null default 'Airport Pickup Service',
  hero_heading text not null default '',
  hero_body text not null default '',
  hero_cta_primary_label text not null default 'Book Airport Pickup',
  hero_cta_secondary_label text not null default 'See Pickup Points',
  hero_badge_top text not null default '',
  hero_badge_bottom text not null default '',
  -- [{value, label}] x3 (airports covered / free waiting time / availability)
  hero_stats jsonb not null default '[]'::jsonb,

  airports_eyebrow text not null default 'Pickup points',
  airports_heading text not null default '',
  airports_body text not null default '',
  -- [{code, name, location, meeting_point, waiting_note, tracking_note, rate_note, rate_amount}] x2 (Kotoka/Accra, Kumasi)
  airports jsonb not null default '[]'::jsonb,

  how_eyebrow text not null default 'How it works',
  how_heading text not null default '',
  -- [{title, body}] x4 - numbered 1-4 by array position on the site, not stored
  how_steps jsonb not null default '[]'::jsonb,

  why_eyebrow text not null default 'Why book with WopeCar',
  why_heading text not null default '',
  -- [{icon_key, title, body}] x4
  why_rows jsonb not null default '[]'::jsonb,

  confirm_eyebrow text not null default 'Confirm your pickup',
  confirm_heading text not null default '',
  confirm_body text not null default '',
  -- [{title, body}] x3
  confirm_perks jsonb not null default '[]'::jsonb,
  -- Client-side form validation only warns below this many hours' notice -
  -- editable so ops can tighten/loosen it without a code deploy if the
  -- real driver-assignment lead time changes.
  min_notice_hours integer not null default 3,

  cta_eyebrow text not null default 'Coming from the airport?',
  cta_heading text not null default '',
  cta_body text not null default '',
  cta_button_label text not null default 'Browse Cars',
  fine_print text not null default '',

  updated_at timestamptz not null default now()
);

alter table airport_pickup_content enable row level security;

create policy airport_pickup_content_public_select on airport_pickup_content
  for select to anon, authenticated
  using (true);

create policy airport_pickup_content_admin_all on airport_pickup_content
  for all to authenticated
  using (is_admin())
  with check (is_admin());

insert into airport_pickup_content (
  hero_heading, hero_body, hero_badge_top, hero_badge_bottom, hero_stats,
  airports_heading, airports_body, airports,
  how_heading, how_steps,
  why_heading, why_rows,
  confirm_heading, confirm_body, confirm_perks,
  cta_heading, cta_body, fine_print
) values (
  'Land and go — we''ll be waiting for you',
  E'Skip the taxi queue. Book a WopeCar airport pickup in advance and a driver will meet you at Arrivals with a name board — ready to take you straight to your car or your destination.',
  'Meet & greet included',
  'Fixed rate · No surge',
  '[
    {"value": "2", "label": "Airports covered"},
    {"value": "60 min", "label": "Free waiting time"},
    {"value": "24/7", "label": "Availability"}
  ]'::jsonb,
  'We meet you at both major airports',
  'Choose your arrival airport when you book — our driver will be waiting at the designated meeting point with a name board.',
  '[
    {
      "code": "ACC", "name": "Kotoka International Airport", "location": "Accra, Greater Accra Region",
      "meeting_point": "Meeting point: Arrivals Hall, opposite the taxi rank",
      "waiting_note": "60 minutes free waiting after landing",
      "tracking_note": "Driver shares live location & phone number before arrival",
      "rate_note": "Flat rate, up to 4 passengers", "rate_amount": "GH₵250"
    },
    {
      "code": "KMS", "name": "Kumasi Airport", "location": "Kumasi, Ashanti Region",
      "meeting_point": "Meeting point: Main terminal exit, arrivals side",
      "waiting_note": "60 minutes free waiting after landing",
      "tracking_note": "Driver shares live location & phone number before arrival",
      "rate_note": "Flat rate, up to 4 passengers", "rate_amount": "GH₵180"
    }
  ]'::jsonb,
  'Booked in minutes, waiting when you land',
  '[
    {"title": "Book in advance", "body": "Fill in your flight and pickup details below — at least 6 hours before you land."},
    {"title": "We track your flight", "body": "If your flight is delayed, we automatically adjust your pickup time — no extra charge."},
    {"title": "Meet your driver", "body": "Your driver waits at Arrivals with a name board and sends their live location as you land."},
    {"title": "Straight to your car", "body": "Head to your rental pickup point or any destination in the city — no queues, no haggling."}
  ]'::jsonb,
  'Airport transfers, done right',
  '[
    {"icon_key": "clock", "title": "Flight tracking & free waiting", "body": "We monitor your flight in real time and give you 60 minutes of free waiting after landing."},
    {"icon_key": "plus", "title": "Fixed upfront pricing", "body": "One flat rate per airport, agreed before you travel. No surge pricing, no surprises."},
    {"icon_key": "shield", "title": "Meet & greet, guaranteed", "body": "Your driver waits with a name board at the arrivals meeting point — every time."},
    {"icon_key": "calendar", "title": "Available around the clock", "body": "Early morning or late night landings — WopeCar airport pickup runs 24 hours a day."}
  ]'::jsonb,
  'Request your airport pickup',
  E'Fill in your travel details and we''ll confirm your driver assignment by email at least 3 hours before you land.',
  '[
    {"title": "Instant request confirmation", "body": "You''ll get a booking reference and a confirmation email the moment you submit."},
    {"title": "Pay on pickup or online", "body": "Choose to settle the flat rate in cash, MoMo or card at pickup."},
    {"title": "Free cancellation", "body": "Email us your reference to cancel or reschedule up to 3 hours before your flight lands."}
  ]'::jsonb,
  'Pair your pickup with a car rental',
  'Book a WopeCar rental in advance and we can have your car ready at your drop-off point right after your airport pickup.',
  'Airport pickup is a standalone service and can be booked with or without a car rental.'
);

create table airport_pickup_requests (
  id uuid primary key default gen_random_uuid(),
  booking_ref text not null unique,

  full_name text not null,
  email text not null,
  phone text not null,

  airport_code text not null,
  airport_name text not null,
  flight_number text not null,
  passengers integer not null default 1,
  arrival_date date not null,
  arrival_time text not null,
  dropoff_destination text not null,
  notes text,

  status text not null default 'pending' check (status in ('pending', 'confirmed', 'completed', 'cancelled')),
  admin_notes text,
  source text not null default 'website',
  notified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index airport_pickup_requests_status_idx on airport_pickup_requests(status);
create index airport_pickup_requests_created_at_idx on airport_pickup_requests(created_at desc);

alter table airport_pickup_requests enable row level security;

create policy airport_pickup_requests_public_insert on airport_pickup_requests
  for insert to anon
  with check (true);

create policy airport_pickup_requests_admin_all on airport_pickup_requests
  for all to authenticated
  using (is_admin())
  with check (is_admin());
