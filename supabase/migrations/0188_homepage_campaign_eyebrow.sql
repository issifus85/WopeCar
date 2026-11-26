-- The homepage Promo Banner (homepage_campaign, 0029/0033/0034) has always rendered a hardcoded
-- "Limited-time offer" eyebrow (components/CampaignBand.tsx on the website) - there was never a
-- column for it, so admin had no way to change it even though every other admin-editable section
-- on this page (airport-pickup, careers, etc.) already has its own eyebrow field.
alter table public.homepage_campaign add column if not exists eyebrow text;
