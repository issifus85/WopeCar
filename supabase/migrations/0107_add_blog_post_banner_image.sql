-- cover_image doubled as both the small thumbnail shown on blog listing
-- cards/sidebar/featured-post tiles AND the large hero banner at the top of
-- an individual post - one field, two different visual jobs, with no way to
-- pick a different image for each. banner_image is optional; the post page
-- falls back to cover_image when it's unset, so existing posts are
-- unaffected until an admin explicitly sets a banner.
alter table blog_posts add column if not exists banner_image text;
