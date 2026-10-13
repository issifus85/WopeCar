-- A phone's push token belongs to whoever is signed in on it now. The client used to upsert straight into push_tokens, but
-- RLS only lets a user update rows they already own - so when a second account signed in on a phone that another account had
-- used, the upsert was refused ("new row violates row-level security policy (USING expression)") and the token stayed with
-- the FIRST account. Result: the first account kept receiving the second account's chat/booking pushes on that phone, and the
-- second account never got any. This SECURITY DEFINER function does the reassignment as the signed-in caller.
create or replace function public.register_push_token(p_token text, p_platform text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'Token required';
  end if;

  insert into push_tokens (user_id, token, platform, updated_at)
  values (auth.uid(), p_token, p_platform, now())
  on conflict (token) do update
    set user_id = auth.uid(), platform = coalesce(excluded.platform, push_tokens.platform), updated_at = now();
end;
$$;

revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
