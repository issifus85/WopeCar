-- reviews.renter_id (0079_add_reviews_table.sql) was pointed at auth.users(id)
-- instead of public.users(id), the only FK in the entire schema that does
-- this - every other renter/user FK (bookings.renter_id, messaging's
-- customer_id, pending_invoices.renter_id, etc.) references public.users.
--
-- PostgREST only resolves embeds within schemas it exposes (public), so
-- auth.users is invisible to it. The admin Reviews page's query -
-- `renter:renter_id ( full_name, email )`, identical on both web
-- (wopecar-admin) and mobile (services/adminReviewsApi.js) - has been
-- failing outright since the table was created: "Could not find a
-- relationship between 'reviews' and 'renter_id' in the schema cache"
-- (PGRST200), confirmed live via a direct REST call. The Reviews
-- moderation page has shown "Could not load reviews." with an empty list
-- this entire time, on both platforms, regardless of how many reviews
-- exist - a real bug, not a data or auth issue.
--
-- Live-checked before writing this: 2 existing reviews, both renter_ids
-- already present in public.users (public.users.id mirrors auth.users.id
-- 1:1 in this schema), so the swap is safe with no orphaned rows.

alter table public.reviews drop constraint reviews_renter_id_fkey;

alter table public.reviews
  add constraint reviews_renter_id_fkey
  foreign key (renter_id) references public.users(id) on delete cascade;
