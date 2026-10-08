-- Rate limiting for the public website-guest-checkout function (it mints an account + session for an email with
-- no ownership proof, so it must not be callable in bulk). Service-role only: RLS on, no policies.
create table if not exists public.guest_checkout_attempts (
  id bigserial primary key,
  ip text,
  email text,
  created_at timestamptz not null default now()
);
create index if not exists guest_checkout_attempts_ip_created_idx on public.guest_checkout_attempts (ip, created_at);
create index if not exists guest_checkout_attempts_email_created_idx on public.guest_checkout_attempts (email, created_at);
alter table public.guest_checkout_attempts enable row level security;
revoke all on public.guest_checkout_attempts from anon, authenticated;
