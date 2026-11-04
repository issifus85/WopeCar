-- The number send-push-notification puts on the app icon. It used to count only unread `notifications` rows, so a chat
-- message push (which deliberately writes no notifications row, see 0149) set the icon to 1, or to a number lower than
-- the one the app itself shows (unread messages + unread notifications, contexts/InboxContext.js). This returns the
-- same total the app shows, for many users at once, so the push and the app agree.
-- Service role only: it reads other users' counts.

create or replace function public.push_badge_counts(p_user_ids uuid[])
returns table (user_id uuid, badge int)
language sql
stable
security definer
set search_path to 'public'
as $$
  select u.id,
    (
      select count(*)::int from notifications n
      where n.user_id = u.id and n.is_read = false
    ) + (
      select count(*)::int
      from conversation_participants cp
      join conversation_messages m on m.conversation_id = cp.conversation_id
      where cp.user_id = u.id
        and m.sender_id <> u.id
        and m.created_at > coalesce(cp.last_read_at, '-infinity'::timestamptz)
    )
  from unnest(p_user_ids) as u(id);
$$;

revoke all on function public.push_badge_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.push_badge_counts(uuid[]) to service_role;
