-- Careers page (/careers on the public website - already linked from the
-- footer's "WopeCar" column, but has only ever been a hardcoded "Coming
-- soon" stub with no `pages` row at all). Same treatment as airport-pickup
-- (migration 0098): real structured content across many sections, too much
-- for content_blocks' generic {heading, body} shape, so it gets its own
-- singleton content table. Open roles are real admin-managed data
-- (careers_jobs), not hardcoded HTML like the mockup - unlike Airport
-- Pickup, applying is just a mailto: link (no submission form), so there's
-- no requests table or notification Edge Function needed here.

create table careers_content (
  id uuid primary key default gen_random_uuid(),

  hero_eyebrow text not null default 'Careers at WopeCar',
  hero_heading text not null default '',
  hero_body text not null default '',
  hero_cta_primary_label text not null default 'View Open Roles',
  hero_cta_secondary_label text not null default 'Hear From Our Team',
  -- [{value, label}] x3
  hero_stats jsonb not null default '[]'::jsonb,

  -- Hero visual "org card" (team snapshot)
  org_badge_top text not null default 'We''re hiring',
  org_card_title text not null default 'Life at WopeCar',
  org_card_subtitle text not null default 'A snapshot of our team',
  -- [{value, label}] x4
  org_stats jsonb not null default '[]'::jsonb,
  org_rating_label text not null default 'Rated by our own team',
  org_rating_quote text not null default '',
  org_badge_bottom text not null default '',

  values_eyebrow text not null default 'How we work',
  values_heading text not null default '',
  values_body text not null default '',
  -- [{icon_key, title, body}] x6
  values jsonb not null default '[]'::jsonb,

  benefits_eyebrow text not null default 'Benefits & perks',
  benefits_heading text not null default '',
  -- [{icon_key, title, body}] x6
  benefits jsonb not null default '[]'::jsonb,

  testimonials_eyebrow text not null default 'From the team',
  testimonials_heading text not null default '',
  testimonials_body text not null default '',
  -- [{quote, author_name, author_title}] x3
  testimonials jsonb not null default '[]'::jsonb,
  testimonials_note text not null default '',

  openings_eyebrow text not null default 'Open roles',
  openings_heading text not null default '',
  openings_body text not null default '',
  jobs_empty_text text not null default 'No open roles in this department right now — check back soon or send us your resume anyway.',

  cta_eyebrow text not null default 'Don''t see the right role?',
  cta_heading text not null default '',
  cta_body text not null default '',
  cta_button_label text not null default 'Send Your Resume',
  cta_email text not null default 'careers@wopecar.com',
  fine_print text not null default '',

  updated_at timestamptz not null default now()
);

alter table careers_content enable row level security;

create policy careers_content_public_select on careers_content
  for select to anon, authenticated
  using (true);

create policy careers_content_admin_all on careers_content
  for all to authenticated
  using (is_admin())
  with check (is_admin());

insert into careers_content (
  hero_heading, hero_body, hero_stats,
  org_stats, org_rating_quote, org_badge_bottom,
  values_heading, values_body, values,
  benefits_heading, benefits,
  testimonials_heading, testimonials_body, testimonials, testimonials_note,
  openings_heading, openings_body,
  cta_heading, cta_body, fine_print
) values (
  'Help us give Ghana the freedom to go places',
  E'We''re a small, fast-moving team building the car rental marketplace Ghana deserves. If you care about ownership, craft and building something real, we''d love to meet you.',
  '[
    {"value": "6", "label": "Open roles"},
    {"value": "2", "label": "Cities — Accra & Kumasi"},
    {"value": "4.8/5", "label": "Team satisfaction"}
  ]'::jsonb,
  '[
    {"value": "38", "label": "Team members"},
    {"value": "7 yrs", "label": "Building in Ghana"},
    {"value": "5", "label": "Departments"},
    {"value": "2026", "label": "Growing fast"}
  ]'::jsonb,
  '"A place to actually build"',
  '38 teammates & counting',
  'What it''s like to build here',
  'We''re small enough that your work matters and moves fast, and ambitious enough to be reshaping how Ghana gets around.',
  '[
    {"icon_key": "star", "title": "Real ownership", "body": "You''ll own outcomes, not just tasks. Good ideas ship regardless of title or tenure."},
    {"icon_key": "chart", "title": "Growth & mentorship", "body": "Learn directly from people who''ve built and scaled products across Africa."},
    {"icon_key": "pin", "title": "Built for Ghana", "body": "Everything we ship is shaped by the roads, the cities and the people we serve every day."},
    {"icon_key": "team-check", "title": "Diverse, close-knit team", "body": "We hire for character and craft — every background and region is represented on our team."},
    {"icon_key": "bolt", "title": "Move fast, stay honest", "body": "We ship quickly, admit mistakes openly, and fix things without ego."},
    {"icon_key": "check", "title": "Customer-obsessed", "body": "Every decision gets measured against one question: does this make things better for our renters and hosts?"}
  ]'::jsonb,
  'We look after our team',
  '[
    {"icon_key": "heart", "title": "Health insurance", "body": "Comprehensive medical cover for you and eligible dependents."},
    {"icon_key": "calendar", "title": "Flexible time off", "body": "Take the rest you need — we trust our team to manage their own time."},
    {"icon_key": "grad-cap", "title": "Learning budget", "body": "An annual stipend for courses, books and conferences that grow your craft."},
    {"icon_key": "car", "title": "Team car discount", "body": "Preferential rates on WopeCar rentals for you and your immediate family."},
    {"icon_key": "pin", "title": "Remote-friendly", "body": "Hybrid by default for most roles — we care about output, not desk time."},
    {"icon_key": "team", "title": "Team retreats", "body": "Company-wide offsites to reconnect, plan, and celebrate wins together."}
  ]'::jsonb,
  'Hear it from the people building WopeCar',
  'We asked our team what it''s really like to work here. Here''s what they said.',
  '[
    {"quote": "What I love most is that no idea is too small to try. I pitched a change to our verification flow in my first month, and it shipped two weeks later.", "author_name": "Kwabena Asante", "author_title": "Fleet Operations Lead · since 2021"},
    {"quote": "Every renter query feels personal here — we''re not reading from a script. Management actually listens when we flag something broken, and we fix it fast.", "author_name": "Efua Mensah", "author_title": "Customer Support Team Lead · since 2022"},
    {"quote": "Coming from a bigger company, the amount of ownership took getting used to — in the best way. I ship features renters use the same week I build them.", "author_name": "Yaw Owusu", "author_title": "Software Engineer · since 2023"}
  ]'::jsonb,
  'Quotes reflect individual team member experiences and are used with permission.',
  'Find your next role',
  'Filter by department to see where we''re hiring right now.',
  'We''re always looking for great people',
  E'If WopeCar sounds like the kind of place you''d want to build something real, send us your resume — we''ll reach out when a fit opens up.',
  'WopeCar is an equal opportunity employer. We welcome applicants of every background, region and walk of life.'
);

create table careers_jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text not null,
  location text not null,
  employment_type text not null default 'Full-time',
  apply_email text not null default 'careers@wopecar.com',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index careers_jobs_active_idx on careers_jobs(is_active);

alter table careers_jobs enable row level security;

create policy careers_jobs_public_select on careers_jobs
  for select to anon, authenticated
  using (is_active = true);

create policy careers_jobs_admin_all on careers_jobs
  for all to authenticated
  using (is_admin())
  with check (is_admin());

insert into careers_jobs (title, department, location, employment_type, sort_order) values
  ('Mobile App Engineer (React Native)', 'Engineering', 'Accra / Remote', 'Full-time', 0),
  ('Fleet Operations Manager', 'Operations', 'Accra', 'Full-time', 1),
  ('Customer Support Associate', 'Customer Success', 'Accra', 'Full-time', 2),
  ('Marketing & Growth Associate', 'Marketing', 'Accra', 'Full-time', 3),
  ('Regional Partnerships Lead', 'Business Development', 'Kumasi', 'Full-time', 4),
  ('Vehicle Inspector', 'Operations', 'Accra', 'Part-time', 5);

-- Seed the `pages` row this page never had (it's been a fully hardcoded
-- stub, see the file header comment above) - the generic admin editor
-- ([slug]/page.tsx) redirects 'careers' to its own dedicated editor, but
-- still needs this row for the is_published toggle and meta_title/meta_desc,
-- same as every other dedicated-table page.
insert into pages (slug, title, meta_title, meta_desc, is_published)
values (
  'careers',
  'Careers',
  'Careers at WopeCar | Join Our Team in Ghana',
  'WopeCar is hiring across engineering, operations, customer success, marketing and business development in Accra and Kumasi. See open roles and apply today.',
  true
)
on conflict (slug) do nothing;
