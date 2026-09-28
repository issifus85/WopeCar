-- Condensed, at-a-glance rental-terms bullets shown directly on the car
-- detail screen/page (components/RentalTermsSection.js on mobile,
-- CondensedTermsBlock.tsx on the website) - distinct from the full,
-- clause-by-clause rental_terms_clauses table, which still powers the
-- separate "View Full Terms & Conditions" reference page (app/rental-terms.js)
-- unchanged. Same reorder/publish-toggle/edit/delete shape as
-- rental_terms_clauses, just a single `body` line per item (no title, no
-- energy-source gating - none of the condensed bullets are EV-specific).
create table rental_terms_summary_items (
  id uuid primary key default gen_random_uuid(),
  drive_type text not null check (drive_type in ('chauffeur', 'self_drive')),
  body text not null,
  position integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rental_terms_summary_items_drive_type_idx on rental_terms_summary_items(drive_type, position);

alter table rental_terms_summary_items enable row level security;

create policy rental_terms_summary_items_public_select on rental_terms_summary_items
  for select to public
  using (is_published = true);

create policy rental_terms_summary_items_admin_all on rental_terms_summary_items
  for all to authenticated
  using (is_admin())
  with check (is_admin());

insert into rental_terms_summary_items (drive_type, body, position) values
  ('chauffeur', '12 hours per day — driver closes by 8:30 PM', 0),
  ('chauffeur', 'Overtime applies after 8:30 PM', 1),
  ('chauffeur', 'Driver''s allowance included in rate', 2),
  ('chauffeur', 'Fuel not included — client responsible', 3),
  ('chauffeur', 'Refundable security deposit: GHS 500', 4),
  ('chauffeur', 'Full payment required before delivery', 5),
  ('chauffeur', 'No cash payments accepted', 6),
  ('chauffeur', 'Cancellation fee applies', 7),
  ('self_drive', 'Minimum rental: 3 days', 0),
  ('self_drive', 'Fuel not included — return at same level', 1),
  ('self_drive', 'Refundable security deposit required', 2),
  ('self_drive', 'Delivery fee: GHS 250', 3),
  ('self_drive', 'Approved drivers only', 4),
  ('self_drive', 'Use within booked locations — modify anytime on app/website', 5),
  ('self_drive', 'Full payment required before delivery', 6),
  ('self_drive', 'No cash payments accepted', 7),
  ('self_drive', 'Cancellation fee applies', 8);
