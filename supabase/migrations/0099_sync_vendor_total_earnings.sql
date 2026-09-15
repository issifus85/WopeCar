-- vendors.total_earnings (0001_initial_schema.sql) has never been written to
-- by anything - no trigger, function, or edge function updates it, so it has
-- sat at its default of 0 for every vendor. wopecar-admin's Vendors list page
-- ("Total earnings" column, lib/api/vendors.ts listApprovedVendors, which
-- also sorts + paginates server-side on this column) reads it directly, so a
-- dead column there means a broken, always-zero column and a meaningless
-- sort order. The admin dashboard's "Top Earning Vendors" card had the same
-- root cause and was fixed client-side (computed live from already-fetched
-- bookings) since it doesn't need server-side pagination; the Vendors list
-- page does, so it needs the column itself to be real and kept in sync.

-- ── Recompute one vendor's total_earnings from paid bookings ───────────────

create or replace function recompute_vendor_total_earnings(p_vendor_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_vendor_id is null then
    return;
  end if;

  update vendors
  set total_earnings = coalesce(
    (select sum(vendor_payout_total) from bookings where vendor_id = p_vendor_id and payment_status = 'paid'),
    0
  )
  where id = p_vendor_id;
end;
$$;

-- ── Keep it in sync on every booking insert/update/delete ──────────────────

create or replace function bookings_sync_vendor_total_earnings()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    perform recompute_vendor_total_earnings(old.vendor_id);
    return old;
  end if;

  perform recompute_vendor_total_earnings(new.vendor_id);
  if tg_op = 'UPDATE' and old.vendor_id is distinct from new.vendor_id then
    perform recompute_vendor_total_earnings(old.vendor_id);
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_sync_vendor_total_earnings on bookings;
create trigger bookings_sync_vendor_total_earnings
  after insert or update of payment_status, vendor_payout_total, vendor_id or delete on bookings
  for each row
  execute function bookings_sync_vendor_total_earnings();

-- ── One-time backfill for all existing bookings ─────────────────────────────

update vendors v
set total_earnings = coalesce(
  (select sum(b.vendor_payout_total) from bookings b where b.vendor_id = v.id and b.payment_status = 'paid'),
  0
);
