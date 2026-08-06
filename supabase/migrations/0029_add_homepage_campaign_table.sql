-- Public homepage promo banner - deliberately a separate table from
-- promo_codes, which is intentionally admin-only in RLS (validated only
-- via the validate_promo_code() RPC, to prevent public code enumeration).
-- This table is the opposite: an admin explicitly curates ONE promotion
-- they want publicly advertised, decoupled from the private codes list.
create table homepage_campaign (
  id uuid primary key default gen_random_uuid(),
  is_active boolean not null default false,
  headline text not null,
  description text not null,
  promo_code text,
  media_type text not null check (media_type in ('image', 'youtube')),
  media_url text not null,
  video_duration_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table homepage_campaign enable row level security;

create policy homepage_campaign_public_select on homepage_campaign
  for select to public
  using (is_active = true);

create policy homepage_campaign_admin_all on homepage_campaign
  for all to authenticated
  using (is_admin())
  with check (is_admin());
