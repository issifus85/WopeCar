-- QuickBooks rotates the refresh token on every refresh and only the newest one works. Two callers refreshing at the same
-- moment (several Edge Functions, or the admin's own test route) could leave the table holding a token Intuit had already
-- replaced, which kills the connection ("Incorrect or invalid refresh token"). Refreshers now take this short lock first.
alter table public.quickbooks_tokens
  add column if not exists refresh_lock_until timestamptz;
