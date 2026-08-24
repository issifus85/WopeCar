-- BACKFILL - already applied live (ledger version 20260803195101, name
-- add_faqs_column_to_cars). Never committed to this repo. Distinct from
-- blog_posts.faqs (0026) and the faqs/car_detail_faqs tables (0038) - this
-- is a per-car jsonb FAQ list column.

alter table public.cars add column if not exists faqs jsonb not null default '[]'::jsonb;
