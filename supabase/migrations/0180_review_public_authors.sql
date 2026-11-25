-- Publish the reviewer's FIRST NAME on public reviews.
--
-- Until now the app asked for the reviewer's name by embedding
-- `renter:renter_id(full_name, avatar_url)` on the `reviews` table. `users`
-- has no public SELECT policy, so PostgREST returned `renter: null` - with a
-- 200, not an error, so it failed silently - and every review in the app
-- rendered as "A WopeCar renter". wopecar-website sidestepped the same wall by
-- never fetching review rows at all.
--
-- Opening `users` up to anon would have exposed every user's full legal name,
-- including people who have never written a review. Instead this adds a narrow
-- read-only view - the same controlled-disclosure pattern `vendor_public_profiles`
-- already uses to show a vendor's business name and avatar without exposing the
-- private columns on `vendors`.
--
-- What it deliberately exposes, and nothing more:
--   * the FIRST word of full_name only. "Mary Ann Adjei" publishes as "Mary";
--     the surname never leaves the database.
--   * only for reviews that are actually published (the WHERE below is the
--     view's own guarantee, not a borrowed RLS one - see the note on
--     security_invoker).
--   * NOT renter_id. The base table has it, but handing anon a review->user id
--     mapping would let anyone correlate a person's reviews across cars.
--   * NOT avatar_url, NOT email, NOT phone. ReviewsSection already falls back
--     to an initial-letter avatar when there is no image.
--
-- security_invoker is deliberately left OFF (the default), exactly as
-- vendor_public_profiles has it. The view therefore runs as its owner and does
-- not inherit the caller's RLS - which is the entire point, since the caller is
-- blocked from `users`. That makes the view itself the security boundary, so
-- the is_published filter is written into the view body where no policy change
-- can weaken it, and only SELECT is granted below.

create or replace view public.reviews_public as
  select
    r.id,
    r.booking_id,
    r.car_id,
    r.vendor_id,
    r.overall_rating,
    r.cleanliness_rating,
    r.accuracy_rating,
    r.communication_rating,
    r.value_rating,
    r.convenience_rating,
    r.content,
    r.created_at,
    r.updated_at,
    -- First word of the name, with only the FIRST LETTER forced upper so a
    -- name typed as "victor" renders as "Victor". Deliberately not initcap():
    -- that lowercases the rest and would turn "McKenzie" into "Mckenzie".
    (select upper(left(fn, 1)) || substr(fn, 2)
       from (select nullif(btrim(split_part(btrim(u.full_name), ' ', 1)), '') as fn) t
    ) as author_first_name
  from public.reviews r
  left join public.users u on u.id = r.renter_id
  where r.is_published = true;

comment on view public.reviews_public is
  'Published reviews with the reviewer''s first name only. The one public read path for review rows - `reviews` itself exposes no name because `users` has no public policy. Read-only: see migration 0180.';

-- Read-only, for everyone. A joined view is not auto-updatable in Postgres, so
-- writes would fail anyway, but this is explicit rather than relying on that:
-- an anon-writable view has bitten this project before (migration 0133-0136).
revoke all on public.reviews_public from anon, authenticated;
grant select on public.reviews_public to anon, authenticated;
