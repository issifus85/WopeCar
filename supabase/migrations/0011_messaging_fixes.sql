-- Fix found during live verification of 0010_messaging.sql:
-- list_conversation_messages(p_conversation_id) raised "column reference
-- 'conversation_id' is ambiguous" - its RETURNS TABLE output columns (id,
-- conversation_id, ...) are implicitly in-scope PL/pgSQL variables for the
-- whole function body, so the unqualified `conversation_id` in the initial
-- authorization check collided with conversation_participants.conversation_id.
create or replace function list_conversation_messages(p_conversation_id uuid)
returns table (
  id uuid, conversation_id uuid, sender_id uuid, sender_name text, sender_is_support boolean,
  body text, created_at timestamptz, is_read boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_can_view boolean;
begin
  select exists (
    select 1 from conversation_participants cp
    where cp.conversation_id = p_conversation_id and cp.user_id = auth.uid()
  ) or is_support() into v_can_view;

  if not v_can_view then
    raise exception 'Not authorized to view this conversation';
  end if;

  return query
    select
      m.id, m.conversation_id, m.sender_id, u.full_name, coalesce(u.is_support or u.role = 'admin', false),
      m.body, m.created_at,
      exists (
        select 1 from conversation_participants cp
        where cp.conversation_id = p_conversation_id
          and cp.user_id <> m.sender_id
          and cp.last_read_at >= m.created_at
      ) as is_read
    from conversation_messages m
    join users u on u.id = m.sender_id
    where m.conversation_id = p_conversation_id
    order by m.created_at asc;
end;
$$;
