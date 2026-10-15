-- When a booking is modified, a NEW QuickBooks invoice + payment (receipt) is issued for the changed booking and the renter is
-- emailed the updated receipt. The old invoice/payment are left in QuickBooks for the finance team to void by hand, so each
-- modification records which QuickBooks documents it replaced and which it created (QuickBooks Ids - the invoice "number" is the
-- booking reference on every one, so the Id is what tells them apart).
alter table public.booking_modifications
  add column if not exists old_qb_invoice_id text,
  add column if not exists old_qb_payment_id text,
  add column if not exists new_qb_invoice_id text,
  add column if not exists new_qb_payment_id text,
  add column if not exists qb_reissued_at timestamptz;
