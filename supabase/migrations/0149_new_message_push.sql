-- Push notification for every new chat message: everyone in the conversation except the sender gets a push that opens the chat.
-- Done in a trigger (not in the send_conversation_message RPC) so it also covers messages sent from the web admin or any
-- other path. No in-app `notifications` row is written - unread messages already show up in the inbox's own unread counts, and
-- a second row would double the badge. Push is sent through the send-push-notification Edge Function using the project's
-- internal_secrets rows 'functions_base_url' / 'anon_key' / 'cron' (see 0148). Any failure is swallowed: a notification problem
-- must never block or undo the message itself.

create or replace function public.notify_new_conversation_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_base text;
  v_anon text;
  v_secret text;
  v_sender_name text;
  v_sender_is_staff boolean;
  v_preview text;
  v_payload jsonb;
begin
  select value into v_base from internal_secrets where name = 'functions_base_url';
  select value into v_anon from internal_secrets where name = 'anon_key';
  select value into v_secret from internal_secrets where name = 'cron';
  if v_base is null or v_anon is null then
    return new;
  end if;

  select coalesce(nullif(trim(u.full_name), ''), 'Someone'), (coalesce(u.is_support, false) or u.role = 'admin')
    into v_sender_name, v_sender_is_staff
  from users u where u.id = new.sender_id;

  v_preview := left(coalesce(
    nullif(trim(new.body), ''),
    case new.attachment_type
      when 'image' then '📷 Photo'
      when 'document' then '📎 ' || coalesce(new.attachment_meta->>'filename', 'Document')
      when 'location' then '📍 Location'
      else 'Sent an attachment'
    end
  ), 140);

  -- Staff see the sender's name; customers (and invited people) see "WopeCar Support" when staff wrote.
  select jsonb_agg(jsonb_build_object(
    'userId', cp.user_id,
    'title', case when coalesce(r.is_support, false) or r.role = 'admin' then coalesce(v_sender_name, 'New message')
                  when coalesce(v_sender_is_staff, false) then 'WopeCar Support'
                  else coalesce(v_sender_name, 'New message') end,
    'body', v_preview,
    'data', jsonb_build_object('url', '/inbox/booking-' || new.conversation_id::text)
  ))
  into v_payload
  from conversation_participants cp
  join users r on r.id = cp.user_id
  where cp.conversation_id = new.conversation_id
    and cp.user_id is distinct from new.sender_id;

  if v_payload is null then
    return new;
  end if;

  perform net.http_post(
    url := v_base || '/send-push-notification',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon, 'x-cron-secret', coalesce(v_secret, '')),
    body := jsonb_build_object('notifications', v_payload)
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_notify_new_conversation_message on public.conversation_messages;
create trigger trg_notify_new_conversation_message
  after insert on public.conversation_messages
  for each row execute function public.notify_new_conversation_message();
