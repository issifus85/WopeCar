-- One shared FAQ set shown on every car detail screen/page (mobile app and
-- website), distinct from the `faqs` table (wopecar.com/faq's own general
-- FAQ list) and from `cars.faqs` (a legacy per-car jsonb column, backfilled
-- from the old Bravo/Laravel export, with no admin UI to edit it -
-- superseded by this table for actual display; left in place, unused).
create table car_detail_faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  position integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

-- Same public-select/admin-all pattern as every other CMS-editable table
-- (faqs, blog_posts, testimonials, pages).
create policy car_detail_faqs_public_select on car_detail_faqs
  for select to public
  using (is_published = true);

create policy car_detail_faqs_admin_all on car_detail_faqs
  for all to authenticated
  using (is_admin())
  with check (is_admin());

alter table car_detail_faqs enable row level security;
