-- Promo banner's "Browse cars" button text was hardcoded on the website
-- (components/CampaignBand.tsx) - cta_url alone let admins change where it
-- goes, this lets them change what it says too.
alter table homepage_campaign add column cta_label text not null default 'Browse cars';
