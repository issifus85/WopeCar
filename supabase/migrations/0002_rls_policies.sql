-- WopeCar Supabase schema - Step 4 (Row Level Security).
-- Run this in the SQL Editor after 0001_initial_schema.sql.

-- ---- Helper functions ----
-- SECURITY DEFINER so these always work regardless of the caller's own RLS
-- restrictions on `users`/`vendors` (avoids any circular-evaluation edge
-- cases). Both are still bounded to auth.uid()'s own identity, so they
-- can't be used to probe anyone else's role or vendor record.

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from users where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function is_vendor_owner(target_vendor_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from vendors where id = target_vendor_id and user_id = auth.uid()
  );
$$;

-- ---- Enable RLS on every table ----
alter table users enable row level security;
alter table regions enable row level security;
alter table vendors enable row level security;
alter table cars enable row level security;
alter table availability enable row level security;
alter table bookings enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;
alter table pages enable row level security;
alter table content_blocks enable row level security;
alter table faqs enable row level security;
alter table testimonials enable row level security;
alter table blog_posts enable row level security;
alter table promo_codes enable row level security;
alter table app_settings enable row level security;

-- =========================================================================
-- users
-- =========================================================================
create policy users_own_select on users for select to authenticated
  using (auth.uid() = id);

create policy users_own_update on users for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

create policy users_admin_all on users for all to authenticated
  using (is_admin()) with check (is_admin());

-- Note: no INSERT policy exists here beyond admin - the spec only asked for
-- SELECT/UPDATE on your own row. That means nothing lets a newly-signed-up
-- user create their own profile row today; the standard fix is a trigger
-- on auth.users that inserts into public.users automatically (SECURITY
-- DEFINER, bypasses RLS). Flagging rather than adding it unprompted, since
-- it changes the signup flow - let me know if you want it added.

-- =========================================================================
-- regions
-- =========================================================================
create policy regions_public_select on regions for select to public
  using (is_active = true);

create policy regions_admin_all on regions for all to authenticated
  using (is_admin()) with check (is_admin());

-- =========================================================================
-- vendors
-- =========================================================================
create policy vendors_own_select on vendors for select to authenticated
  using (user_id = auth.uid());

create policy vendors_own_update on vendors for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy vendors_admin_all on vendors for all to authenticated
  using (is_admin()) with check (is_admin());

-- Same gap as `users`: no INSERT policy, so becoming a vendor requires an
-- admin (or service_role) to create the row - matches the spec literally.

-- =========================================================================
-- cars
-- =========================================================================
create policy cars_public_select on cars for select to public
  using (status = 'active');

create policy cars_vendor_select on cars for select to authenticated
  using (is_vendor_owner(vendor_id));

create policy cars_vendor_insert on cars for insert to authenticated
  with check (is_vendor_owner(vendor_id));

create policy cars_vendor_update on cars for update to authenticated
  using (is_vendor_owner(vendor_id)) with check (is_vendor_owner(vendor_id));

create policy cars_admin_all on cars for all to authenticated
  using (is_admin()) with check (is_admin());

-- No DELETE for vendors, per spec (only SELECT/INSERT/UPDATE listed) - a
-- vendor retiring a listing sets status='inactive' via UPDATE instead.

-- =========================================================================
-- availability
-- =========================================================================
create policy availability_vendor_select on availability for select to authenticated
  using (exists (
    select 1 from cars where cars.id = availability.car_id and is_vendor_owner(cars.vendor_id)
  ));

create policy availability_vendor_insert on availability for insert to authenticated
  with check (exists (
    select 1 from cars where cars.id = availability.car_id and is_vendor_owner(cars.vendor_id)
  ));

create policy availability_vendor_update on availability for update to authenticated
  using (exists (
    select 1 from cars where cars.id = availability.car_id and is_vendor_owner(cars.vendor_id)
  ))
  with check (exists (
    select 1 from cars where cars.id = availability.car_id and is_vendor_owner(cars.vendor_id)
  ));

create policy availability_vendor_delete on availability for delete to authenticated
  using (exists (
    select 1 from cars where cars.id = availability.car_id and is_vendor_owner(cars.vendor_id)
  ));

create policy availability_admin_all on availability for all to authenticated
  using (is_admin()) with check (is_admin());

-- Gap worth flagging: renters have no read access to `availability` at all
-- per the spec (not in the public-read list, not in renter policies) - as
-- written, a renter's client can't check which dates are blocked/booked
-- before submitting a booking request. Flagging rather than adding an
-- unrequested public-read policy.

-- =========================================================================
-- bookings
-- =========================================================================
create policy bookings_renter_select on bookings for select to authenticated
  using (renter_id = auth.uid());

create policy bookings_renter_insert on bookings for insert to authenticated
  with check (renter_id = auth.uid());

create policy bookings_vendor_select on bookings for select to authenticated
  using (is_vendor_owner(vendor_id));

create policy bookings_admin_all on bookings for all to authenticated
  using (is_admin()) with check (is_admin());

-- "NO access to renter personal data" for vendors: RLS is row-level, not
-- column-level, so a vendor's SELECT does return the renter_id column (a
-- vendor legitimately needs the renter's identity to fulfil a booking).
-- What actually keeps renter PII (name/email/phone) hidden is that the
-- `users` table's own RLS only lets someone read their own row - a vendor
-- can see `bookings.renter_id` but cannot join to read that renter's
-- `users` row. If you want the raw renter_id itself hidden too, that needs
-- a restricted view (e.g. a `vendor_bookings_view`) instead of table RLS -
-- happy to add one if you want that stricter guarantee.
--
-- Also no INSERT/UPDATE/DELETE for vendors here per spec (SELECT only) -
-- meaning nothing lets a vendor flip `vendor_accepted` to true today.
-- Flagging since that's presumably needed for an accept/decline flow.

-- =========================================================================
-- messages
-- =========================================================================
create policy messages_own_select on messages for select to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

create policy messages_own_insert on messages for insert to authenticated
  with check (sender_id = auth.uid());

create policy messages_admin_all on messages for all to authenticated
  using (is_admin()) with check (is_admin());

-- =========================================================================
-- notifications
-- =========================================================================
create policy notifications_own_select on notifications for select to authenticated
  using (user_id = auth.uid());

create policy notifications_own_update on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notifications_admin_all on notifications for all to authenticated
  using (is_admin()) with check (is_admin());

-- No INSERT policy for regular users, per spec - notifications are created
-- by admin/service_role (e.g. a backend function), not by the recipient.

-- =========================================================================
-- pages
-- =========================================================================
create policy pages_public_select on pages for select to public
  using (is_published = true);

create policy pages_admin_all on pages for all to authenticated
  using (is_admin()) with check (is_admin());

-- =========================================================================
-- content_blocks
-- =========================================================================
create policy content_blocks_admin_all on content_blocks for all to authenticated
  using (is_admin()) with check (is_admin());

-- Gap worth flagging: content_blocks wasn't in the public-read list, but a
-- published page can't actually render its blocks without reading this
-- table too. Left admin-only per the literal spec - let me know if you want
-- a public-read policy mirroring `pages` (block's page is published and
-- is_visible = true).

-- =========================================================================
-- faqs
-- =========================================================================
create policy faqs_public_select on faqs for select to public
  using (is_published = true);

create policy faqs_admin_all on faqs for all to authenticated
  using (is_admin()) with check (is_admin());

-- =========================================================================
-- testimonials
-- =========================================================================
create policy testimonials_public_select on testimonials for select to public
  using (is_published = true);

create policy testimonials_admin_all on testimonials for all to authenticated
  using (is_admin()) with check (is_admin());

-- =========================================================================
-- blog_posts
-- =========================================================================
create policy blog_posts_public_select on blog_posts for select to public
  using (is_published = true);

create policy blog_posts_admin_all on blog_posts for all to authenticated
  using (is_admin()) with check (is_admin());

-- =========================================================================
-- promo_codes
-- =========================================================================
create policy promo_codes_admin_all on promo_codes for all to authenticated
  using (is_admin()) with check (is_admin());

-- Admin-only, per spec (not listed under public/renter/vendor at all) -
-- this is actually good practice: promo code validation/redemption should
-- go through a server-side function, not a client-readable table, so a
-- renter's app can't enumerate valid codes.

-- =========================================================================
-- app_settings
-- =========================================================================
create policy app_settings_public_select on app_settings for select to public
  using (true);

create policy app_settings_admin_all on app_settings for all to authenticated
  using (is_admin()) with check (is_admin());
