-- Who a promo campaign reaches within its target role:
--   'everyone'       - every user in the target group (the original behaviour; existing campaigns keep it)
--   'app_active_30d' - only users with a registered push token refreshed in the last 30 days, i.e. the app is
--                      installed, notifications are allowed, and they opened it recently (the app re-registers its
--                      token on every cold start / sign-in via register_push_token, which bumps updated_at).
-- send-promo-notifications reads this column, so run this migration BEFORE deploying that function.
alter table promo_notification_campaigns
  add column if not exists audience text not null default 'everyone'
  check (audience in ('everyone', 'app_active_30d'));

-- The active-app filter scans push_tokens by recency.
create index if not exists push_tokens_updated_at_idx on push_tokens (updated_at);
