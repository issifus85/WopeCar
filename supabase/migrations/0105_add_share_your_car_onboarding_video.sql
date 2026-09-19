-- New section on /share-your-car, directly below the "How it works" steps -
-- an optional onboarding video an admin can link from YouTube, no code
-- deploy needed. video_youtube_url stays nullable/blank by default so the
-- section simply doesn't render until an admin adds a real link (same
-- pattern as hero_image_url/elig_image_url above).
alter table share_your_car_content
  add column video_eyebrow text not null default 'See it in action',
  add column video_heading text not null default 'Watch how hosting works',
  add column video_youtube_url text;
