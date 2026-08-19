-- Vendor payouts (quickbooks-record-payout) need a persistent QuickBooks
-- Vendor entity per WopeCar vendor, same reasoning as users.qb_customer_id
-- (migration 0063) - without it, every payout would create a duplicate
-- Vendor record in QuickBooks instead of reusing the same one.
alter table vendors add column if not exists qb_vendor_id text;
