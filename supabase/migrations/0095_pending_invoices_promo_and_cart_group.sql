-- Extends pending_invoices (migration 0065) for wopecar-website's
-- multi-item "Save & Pay Later" - see [[website_instant_booking_cart]].
--
-- promo_code/promo_discount_amount: informational only, mirroring the same
-- columns on `bookings` - the website's cart can have a promo code applied
-- before saving, and this preserves what was shown to the renter at save
-- time. The code is NOT redeemed (uses_count incremented) at save time -
-- only recorded here - redemption still only happens once, at real
-- payment, via redeem_promo_code(), exactly like every other checkout
-- path. Mobile's single-booking Save & Pay Later never had promo support
-- at all, so these are simply unused (default) on every mobile-created row.
--
-- cart_group_id: the website's cart can hold multiple cars in one
-- checkout, saved together in one "Save & Pay Later" action - all N
-- pending_invoices rows created in that action share one cart_group_id so
-- the cart page can group/resume/void them as a single unit. Defaults to a
-- fresh random uuid per row so mobile's existing single-row inserts don't
-- need any code change - each just becomes its own trivial one-row group.
alter table pending_invoices
  add column if not exists promo_code text,
  add column if not exists promo_discount_amount numeric not null default 0,
  add column if not exists cart_group_id uuid not null default gen_random_uuid();

create index if not exists pending_invoices_cart_group_id_idx on pending_invoices(cart_group_id);
