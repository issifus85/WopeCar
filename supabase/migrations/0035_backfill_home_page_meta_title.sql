-- The 'home' pages row (added in 0030) never got meta_title/meta_desc set,
-- only `title` (the admin's internal "Homepage" label for the Pages list).
-- getPageOverride()'s fallback chain is `meta_title || title || <hardcoded
-- default>`, so with meta_title null the internal label "Homepage" was
-- winning and became the site's actual <title> tag - caught live by
-- testing the CMS wiring end-to-end. The other 11 static pages (added in
-- 0032) already had real meta_title/meta_desc set, so this was isolated to
-- home.
update pages
set meta_title = 'WopeCar — Freedom to Go Places | Car Rentals in Ghana',
    meta_desc = 'Ghana''s leading online car rental marketplace. Hosts list their cars, renters book them — self-drive or with a driver.'
where slug = 'home';
