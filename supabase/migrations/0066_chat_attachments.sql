-- Chat attachments (image/document/location) + per-message read timestamps.
-- conversation_messages previously only carried plain text (`body`); this
-- adds an optional attachment on the same row rather than a separate
-- attachments table, since a message is always exactly one of "text" /
-- "text + attachment" / "attachment only" - never multiple attachments per
-- message, so a 1:1 column set is simpler than a join for every read.

alter table conversation_messages
  add column attachment_type text check (attachment_type in ('image', 'document', 'location')),
  add column attachment_url text,
  add column attachment_meta jsonb;

-- An attachment-only message (just a photo, no caption) shouldn't need
-- placeholder text - relax the original `body text not null` to nullable,
-- guarded by a check that at least one of body/attachment is present so a
-- fully-empty message still can't be inserted.
alter table conversation_messages alter column body drop not null;
alter table conversation_messages
  add constraint conversation_messages_body_or_attachment
  check (body is not null or attachment_type is not null);

create or replace function send_conversation_message(
  p_conversation_id uuid,
  p_body text,
  p_attachment_type text default null,
  p_attachment_url text default null,
  p_attachment_meta jsonb default null
)
returns conversation_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_participant boolean;
  v_message conversation_messages;
  v_preview text;
begin
  select exists (
    select 1 from conversation_participants
    where conversation_id = p_conversation_id and user_id = auth.uid()
  ) into v_is_participant;

  if not v_is_participant then
    if is_support() then
      insert into conversation_participants (conversation_id, user_id, role_in_conversation)
      values (p_conversation_id, auth.uid(), 'support')
      on conflict (conversation_id, user_id) do nothing;
    else
      raise exception 'You are not a participant of this conversation';
    end if;
  end if;

  insert into conversation_messages (conversation_id, sender_id, body, attachment_type, attachment_url, attachment_meta)
  values (p_conversation_id, auth.uid(), p_body, p_attachment_type, p_attachment_url, p_attachment_meta)
  returning * into v_message;

  -- Conversation list previews (list_conversations' last_message_preview)
  -- need something sensible to show for an attachment-only message, since
  -- p_body can now be null.
  v_preview := coalesce(
    p_body,
    case p_attachment_type
      when 'image' then '📷 Photo'
      when 'document' then '📎 ' || coalesce(p_attachment_meta->>'filename', 'Document')
      when 'location' then '📍 Location'
      else 'Attachment'
    end
  );

  update conversations set
    last_message_at = v_message.created_at,
    last_message_preview = left(v_preview, 200),
    last_message_sender_id = auth.uid()
  where id = p_conversation_id;

  return v_message;
end;
$$;
revoke execute on function send_conversation_message(uuid, text, text, text, jsonb) from public;
grant execute on function send_conversation_message(uuid, text, text, text, jsonb) to authenticated;

-- Old 2-arg signature is superseded by the 5-arg one above (the 3 new
-- params all default to null, so every existing call site keeps working
-- unchanged) - drop it rather than leaving two overloads of the same RPC
-- name for PostgREST to disambiguate between.
drop function if exists send_conversation_message(uuid, text);

-- Changing the RETURNS TABLE shape requires dropping first - Postgres
-- won't let create-or-replace change a function's OUT-parameter row type.
drop function if exists list_conversation_messages(uuid);

create or replace function list_conversation_messages(p_conversation_id uuid)
returns table (
  id uuid, conversation_id uuid, sender_id uuid, sender_name text, sender_is_support boolean,
  body text, attachment_type text, attachment_url text, attachment_meta jsonb,
  created_at timestamptz, is_read boolean, read_at timestamptz
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
      m.body, m.attachment_type, m.attachment_url, m.attachment_meta,
      m.created_at,
      exists (
        select 1 from conversation_participants cp
        where cp.conversation_id = p_conversation_id
          and cp.user_id <> m.sender_id
          and cp.last_read_at >= m.created_at
      ) as is_read,
      -- Same "read by any other participant" semantics as is_read above,
      -- surfaced as a real timestamp instead of a boolean for the UI's
      -- "Read · 3:45 PM" label. min() rather than max() across other
      -- readers: the earliest moment a non-sender confirmed reading this
      -- message (for the common 2-party thread there's only one other
      -- participant, so this is unambiguous either way).
      (
        select min(cp.last_read_at) from conversation_participants cp
        where cp.conversation_id = p_conversation_id
          and cp.user_id <> m.sender_id
          and cp.last_read_at >= m.created_at
      ) as read_at
    from conversation_messages m
    join users u on u.id = m.sender_id
    where m.conversation_id = p_conversation_id
    order by m.created_at asc;
end;
$$;
revoke execute on function list_conversation_messages(uuid) from public;
grant execute on function list_conversation_messages(uuid) to authenticated;

-- Storage: chat attachments live in the existing private `documents`
-- bucket under documents/chat/<conversation_id>/<sender_id>-<ts>.<ext> -
-- reusing the bucket rather than creating a new one (same "documents" is
-- already the private, RLS-gated bucket for exactly this kind of shared,
-- non-public file). The base owner-folder policies from
-- 0003_storage_policies.sql (([1] = auth.uid())) don't apply to this path
-- shape and are left untouched; these are additive permissive policies
-- (Postgres OR's multiple permissive policies for the same command), same
-- pattern as 0017's inspection-photo carve-out - just keyed by conversation
-- membership instead of a specific booking's renter/vendor pair, since a
-- conversation can include invited third parties too.
create policy documents_chat_participant_select on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'chat'
    and exists (
      select 1 from conversation_participants cp
      where cp.conversation_id::text = (storage.foldername(name))[2]
        and cp.user_id = auth.uid()
    )
  );

create policy documents_chat_participant_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'chat'
    and exists (
      select 1 from conversation_participants cp
      where cp.conversation_id::text = (storage.foldername(name))[2]
        and cp.user_id = auth.uid()
    )
  );
