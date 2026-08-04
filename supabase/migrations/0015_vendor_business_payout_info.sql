-- Gap: app/vendor/business-info.js and app/vendor/payout-method.js saved to
-- local storage only (vendorSettings.businessInfo / .payoutMethod) - the
-- `vendors` table had no columns for either. Both are discriminated-union
-- shapes (individual/business; mobile_money/bank) that don't map cleanly
-- onto a handful of nullable text columns, so - matching this table's
-- existing jsonb precedent on `cars` (regional_addons, faqs,
-- length_of_stay_discounts) - each gets a single jsonb column instead.
alter table public.vendors
  add column if not exists business_info jsonb not null default '{}'::jsonb,
  add column if not exists payout_method jsonb not null default '{}'::jsonb;
