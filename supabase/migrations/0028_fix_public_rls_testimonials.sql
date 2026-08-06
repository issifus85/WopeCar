-- Same zero-policy gap as blog_posts/faqs had - nothing could read this
-- table, including admins. Matches the standard public-select/admin-all
-- pattern used elsewhere.
create policy testimonials_public_select on testimonials
  for select to public
  using (is_published = true);

create policy testimonials_admin_all on testimonials
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- Lets a Google Reviews sync job upsert without creating duplicates on
-- every re-run. Nullable - only used for source='google' rows.
alter table testimonials add column external_id text unique;
