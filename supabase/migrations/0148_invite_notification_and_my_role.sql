-- 1) Inviting someone to a conversation now tells them: an in-app notification (deep-links into the chat) plus a push.
--    Push is sent through the send-push-notification Edge Function using the project's functions URL + anon key + the
--    internal cron secret, all read from public.internal_secrets (rows 'functions_base_url' and 'anon_key', set per
--    project - see the INSERTs applied alongside this migration). Any failure here is swallowed: the invite itself must
--    never fail because a notification could not be sent.
-- 2) list_conversations returns my_role - the caller's own role in each conversation ('customer', 'support', 'invited', ...)
--    - so the app can show an invited person (e.g. a driver) who the customer is instead of "WopeCar Support".

create or replace function public.invite_conversation_participant(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inserted int;
  v_context text;
  v_base text;
  v_anon text;
  v_secret text;
  v_title constant text := 'You were added to a conversation';
  v_body text;
begin
  if not is_support() then
    raise exception 'Only support may invite participants';
  end if;

  if exists (
    select 1 from conversations c
    join bookings b on b.id = c.booking_id
    join vendors v on v.id = b.vendor_id
    where c.id = p_conversation_id and v.user_id = p_user_id
  ) then
    raise exception 'The booking''s vendor may not be added to its conversation';
  end if;

  insert into conversation_participants (conversation_id, user_id, role_in_conversation, invited_by_user_id)
  values (p_conversation_id, p_user_id, 'invited', auth.uid())
  on conflict (conversation_id, user_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return; -- already in the conversation: nothing new to announce
  end if;

  begin
    select coalesce(bc.name, ic.name) into v_context
    from conversations c
    left join bookings b on b.id = c.booking_id
    left join cars bc on bc.id = b.car_id
    left join cars ic on ic.id = c.car_id
    where c.id = p_conversation_id;

    v_body := 'WopeCar Support added you to a chat' || coalesce(' about ' || v_context, '') || '. Tap to open it.';

    insert into notifications (user_id, type, title, body, conversation_id)
    values (p_user_id, 'conversation_invited', v_title, v_body, p_conversation_id);

    select value into v_base from internal_secrets where name = 'functions_base_url';
    select value into v_anon from internal_secrets where name = 'anon_key';
    select value into v_secret from internal_secrets where name = 'cron';
    if v_base is not null and v_anon is not null then
      perform net.http_post(
        url := v_base || '/send-push-notification',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon, 'x-cron-secret', coalesce(v_secret, '')),
        body := jsonb_build_object('notifications', jsonb_build_array(jsonb_build_object(
          'userId', p_user_id, 'title', v_title, 'body', v_body,
          'data', jsonb_build_object('url', '/inbox/booking-' || p_conversation_id::text)
        )))
      );
    end if;
  exception when others then
    null; -- never let a notification problem undo the invite
  end;
end;
$$;

drop function if exists public.list_conversations(text);
drop function if exists public.list_conversations(text, text);

create or replace function public.list_conversations(p_scope text default 'mine', p_category text default null)
returns table(id uuid, booking_id uuid, created_at timestamptz, pinned_summary jsonb, last_message jsonb, unread_count integer, is_resolved boolean, is_urgent boolean, my_role text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if p_scope = 'all' and not is_support() then
    raise exception 'Only support may list all conversations';
  end if;

  if p_category is not null and p_category not in ('general', 'support_ops') then
    raise exception 'Invalid category: %', p_category;
  end if;

  return query
    select
      c.id,
      c.booking_id,
      c.created_at,
      case
        when c.booking_id is not null then
          jsonb_build_object(
            'carId', booking_car.id,
            'carImage', booking_car.images[1],
            'carName', booking_car.name,
            'status', b.status,
            'customerName', renter.full_name,
            'pickupDateTime', b.start_date::text || ' ' || coalesce(b.pickup_time, ''),
            'pickupAddress', b.pickup_location,
            'returnDateTime', b.end_date::text || ' ' || coalesce(b.return_time, ''),
            'returnAddress', b.return_location
          ) || case when b.renter_id = auth.uid() then
            jsonb_build_object(
              'totalCost', b.total_cost,
              'paid', case when b.payment_status = 'paid' then b.total_cost else 0 end,
              'addonNames', to_jsonb(coalesce(b.addon_names, '{}'::text[]))
            )
          else '{}'::jsonb end
        when c.car_id is not null then
          jsonb_build_object(
            'carId', inquiry_car.id,
            'carImage', inquiry_car.images[1],
            'carName', inquiry_car.name,
            'status', 'inquiry',
            'customerName', customer.full_name
          )
        else
          jsonb_build_object('status', 'vendor_support', 'customerName', customer.full_name)
      end as pinned_summary,
      case when c.last_message_at is null then null else
        jsonb_build_object('body', c.last_message_preview, 'senderId', c.last_message_sender_id, 'createdAt', c.last_message_at)
      end as last_message,
      (
        select count(*)::int from conversation_messages m
        where m.conversation_id = c.id
          and m.sender_id <> auth.uid()
          and m.created_at > coalesce(
            (select cp2.last_read_at from conversation_participants cp2
               where cp2.conversation_id = c.id and cp2.user_id = auth.uid()),
            '-infinity'::timestamptz
          )
      ) as unread_count,
      c.is_resolved,
      c.is_urgent,
      (select cp3.role_in_conversation from conversation_participants cp3
         where cp3.conversation_id = c.id and cp3.user_id = auth.uid() limit 1) as my_role
    from conversations c
    left join bookings b on b.id = c.booking_id
    left join cars booking_car on booking_car.id = b.car_id
    left join users renter on renter.id = b.renter_id
    left join cars inquiry_car on inquiry_car.id = c.car_id
    left join users customer on customer.id = c.customer_id
    where (
      p_scope = 'all'
      or exists (
        select 1 from conversation_participants cp
        where cp.conversation_id = c.id and cp.user_id = auth.uid()
      )
    )
    and (
      p_category is null
      or (p_category = 'general' and c.booking_id is null and c.car_id is null)
      or (p_category = 'support_ops' and (c.booking_id is not null or c.car_id is not null))
    )
    order by c.last_message_at desc nulls last, c.created_at desc;
end;
$$;

-- NOTE: the old one-argument list_conversations(p_scope) overload is deliberately NOT recreated. Next to the two-argument
-- version (whose p_category defaults to null) it made any call with only p_scope ambiguous
-- ("Could not choose the best candidate function"); the default argument already covers those callers.

grant execute on function public.list_conversations(text, text) to anon, authenticated, service_role;
