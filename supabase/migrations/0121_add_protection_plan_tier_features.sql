-- The /protection-plan marketing page's plan cards never showed the actual
-- per-tier benefits (the page had no column for them at all) - this adds
-- one, admin-editable like every other field on protection_plan_tiers, and
-- seeds it with the same real benefit wording as the app/website checkout
-- WOPECARE_PLANS.features (constants/pricing.js / lib/data/wopecare.ts),
-- including '24/7 roadside assistance' on all three tiers.
alter table protection_plan_tiers add column if not exists features text[] not null default '{}';

update protection_plan_tiers set features = array[
  'Scratches & scuffs', 'Minor dents', 'Minor bumper & body damage', '24/7 roadside assistance'
] where name = 'Basic';

update protection_plan_tiers set features = array[
  'Scratches & scuffs', 'Minor dents', 'Minor bumper & body damage', 'More protection for unexpected damage', '24/7 roadside assistance'
] where name = 'Plus';

update protection_plan_tiers set features = array[
  'Scratches & scuffs', 'Minor dents', 'Minor bumper & body damage', 'Our highest incidental damage protection', '24/7 roadside assistance'
] where name = 'Premium';
