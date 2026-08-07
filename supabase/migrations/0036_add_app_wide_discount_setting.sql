-- Admin-only, site-wide promotional discount - applies to any car that does
-- NOT already have its own active discount (a car's own discount_enabled
-- always takes priority over this one; see constants/pricing.js's
-- calculateRentalPricing / isAnyDiscountActive / applyAnyDiscount). Stored
-- as 5 separate scalar keys (rather than one jsonb object) to match every
-- other app_settings row's flat key/value shape, so the admin settings
-- pages' existing generic single-value editor works here without a
-- bespoke widget.
insert into app_settings (key, value, description)
values
  ('app_wide_discount_enabled', 'false'::jsonb, 'Whether the site-wide promotional discount is currently on. Only applies to cars without their own discount already enabled.'),
  ('app_wide_discount_type', '"percentage"'::jsonb, 'App-wide discount type: "percentage" or "flat".'),
  ('app_wide_discount_value', 'null'::jsonb, 'App-wide discount amount - a percent (e.g. 10) or a flat GHS amount, depending on app_wide_discount_type.'),
  ('app_wide_discount_starts_at', 'null'::jsonb, 'App-wide discount active-window start date (YYYY-MM-DD), or null for no start bound.'),
  ('app_wide_discount_ends_at', 'null'::jsonb, 'App-wide discount active-window end date (YYYY-MM-DD), or null for no end bound.')
on conflict (key) do nothing;
