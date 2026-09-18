-- Homepage hero's two floating badge pills ("69+ verified cars", "★ 4.8
-- rating on Google") had no admin editing at all - the car count was a
-- live query (accurate, but not admin-overridable) and the rating was a
-- hardcoded TS constant (lib/seo/constants.ts's GOOGLE_RATING). Both are
-- now plain admin-editable app_settings, same pattern as the existing
-- partner_stat_* keys (0030_homepage_content_blocks_and_partner_stats.sql).
-- Seeded with production's real current values so nothing visibly changes
-- until an admin actually edits one.
insert into app_settings (key, value, description) values
  ('hero_google_rating', '"4.8"', 'Website homepage hero - "★ X rating on Google" floating badge'),
  ('hero_verified_cars_count', '"76"', 'Website homepage hero - "Y+ verified cars" floating badge')
on conflict (key) do nothing;
