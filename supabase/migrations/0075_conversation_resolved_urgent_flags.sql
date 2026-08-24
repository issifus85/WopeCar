-- BACKFILL - already applied live (ledger version 20260801144946, name
-- admin_inbox_flags). is_resolved/is_urgent are the columns
-- 0042_inquiry_conversations.sql, 0067_vendor_support_conversation.sql, and
-- 0072_conversation_categories.sql's list_conversations/get_conversation
-- already select and rely on - this is the migration that originally added
-- them, previously missing from the repo entirely (their absence was
-- already flagged mid-session during the Inbox/Ride Support split work).
-- This migration's own original set_conversation_flags body is still the
-- live one (never redefined by a later migration) so it's included as-is;
-- the original list_conversations/get_conversation bodies from this same
-- migration are NOT included here since they're long since superseded by
-- 0042/0067/0072's versions - restoring this migration's older versions of
-- those two functions would be a real regression, not a backfill.

alter table conversations
  add column if not exists is_resolved boolean not null default false,
  add column if not exists is_urgent boolean not null default false;

create or replace function public.set_conversation_flags(p_conversation_id uuid, p_is_resolved boolean default null, p_is_urgent boolean default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not is_support() then
    raise exception 'Only support may update conversation flags';
  end if;

  update conversations
  set is_resolved = coalesce(p_is_resolved, is_resolved),
      is_urgent = coalesce(p_is_urgent, is_urgent)
  where id = p_conversation_id;
end;
$function$;
