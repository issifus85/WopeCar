-- blog_posts and faqs had RLS enabled with zero policies (confirmed via
-- advisors) - nothing, not even admins via the dashboards, could read
-- them. Matches the same public-select/admin-all pattern already used on
-- pages/regions/reviews.
create policy blog_posts_public_select on blog_posts
  for select to public
  using (is_published = true);

create policy blog_posts_admin_all on blog_posts
  for all to authenticated
  using (is_admin())
  with check (is_admin());

create policy faqs_public_select on faqs
  for select to public
  using (is_published = true);

create policy faqs_admin_all on faqs
  for all to authenticated
  using (is_admin())
  with check (is_admin());
