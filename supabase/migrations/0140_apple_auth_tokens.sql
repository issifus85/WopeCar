-- Sign in with Apple: App Store rule 5.1.1(v) requires revoking the user's Apple token when they delete their
-- account. The refresh token Apple returns when we exchange the sign-in authorization code is kept here (service
-- role only: RLS on, no policies, no API privileges) so delete-account can revoke it. No FK to auth.users because
-- accounts are soft-deleted and the row is removed by delete-account itself.
create table if not exists public.apple_auth_tokens (
  user_id uuid primary key,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);
alter table public.apple_auth_tokens enable row level security;
revoke all on public.apple_auth_tokens from anon, authenticated;
