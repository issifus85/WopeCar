-- BACKFILL - already applied live (ledger version 20260802194644, name
-- vendor_doc_review_and_promo_redemption). Only the portion not already
-- covered by 0018_add_car_compliance_documents.sql /
-- 0068_national_id.sql (documents_type_check's vendor_id_front/
-- vendor_id_back/vendor_business_reg values) is included here.

alter table vendors
  add column if not exists id_document_status text not null default 'not_submitted'
    check (id_document_status = any (array['not_submitted','under_review','verified','rejected'])),
  add column if not exists id_document_rejection_reason text,
  add column if not exists business_reg_document_status text not null default 'not_submitted'
    check (business_reg_document_status = any (array['not_submitted','under_review','verified','rejected'])),
  add column if not exists business_reg_document_rejection_reason text;

alter table bookings
  add column if not exists promo_code text,
  add column if not exists promo_discount_amount numeric not null default 0;

create or replace function validate_promo_code(p_code text)
returns table(code text, discount_type text, discount_value numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select pc.code, pc.discount_type, pc.discount_value
  from promo_codes pc
  where upper(pc.code) = upper(trim(p_code))
    and pc.is_active
    and (pc.expires_at is null or pc.expires_at > now())
    and (pc.max_uses is null or pc.uses_count < pc.max_uses)
  limit 1;
end;
$$;

create or replace function redeem_promo_code(p_code text)
returns table(code text, discount_type text, discount_value numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row promo_codes%rowtype;
begin
  select * into v_row
  from promo_codes
  where upper(promo_codes.code) = upper(trim(p_code))
    and is_active
    and (expires_at is null or expires_at > now())
    and (max_uses is null or uses_count < max_uses)
  for update;

  if not found then
    raise exception 'Invalid or expired promo code';
  end if;

  update promo_codes set uses_count = uses_count + 1 where id = v_row.id;

  return query select v_row.code, v_row.discount_type, v_row.discount_value;
end;
$$;

grant execute on function validate_promo_code(text) to authenticated;
grant execute on function redeem_promo_code(text) to authenticated;
