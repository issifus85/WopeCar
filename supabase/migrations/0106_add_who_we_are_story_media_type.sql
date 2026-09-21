-- "Our Story" section's right-hand media (who-we-are page) was a fixed
-- image only (story_image_url). Adds a video option, same media_type/url
-- pattern as homepage_campaign - default 'image' so every existing row
-- keeps rendering exactly as it does today with zero admin action needed.
alter table who_we_are_content
  add column story_media_type text not null default 'image',
  add column story_video_url text;
