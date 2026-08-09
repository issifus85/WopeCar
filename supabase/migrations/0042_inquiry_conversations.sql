-- Pre-booking "Inquiry" conversations, pinned to a car instead of a real
-- booking. Until now, tapping "Inquiry" on a car (app/car/[id].js's
-- BookingChoiceModal) opened a purely local-device conversation
-- (contexts/InboxContext.js's startConversation) that never touched
-- Supabase at all - invisible to staff/admin, and every car's inquiry
-- collapsed into the same single generic "WopeCar Support" conversation id
-- (conv-support), silently discarding the car-specific opening message.
-- This migration makes Inquiry go through the same real, RLS-safe
-- conversations/conversation_participants/conversation_messages tables the
-- booking-anchored flow already uses (0010_messaging.sql), so staff can
-- actually see it and both sides can see which car it's about.

-- booking_id was NOT NULL - a conversation could only ever be anchored to a
-- real booking. Relaxed so a conversation can instead be anchored to a bare
-- car_id (added below) for a pre-booking inquiry. UNIQUE is untouched -
-- Postgres allows multiple NULLs under a unique constraint, so this doesn't
-- open the door to duplicate booking-anchored conversations.
alter table conversations alter column booking_id drop not null;

alter table conversations add column car_id uuid references cars(id);

-- Exactly one of the two anchors must be set - never both, never neither.
alter table conversations add constraint conversations_booking_xor_car
  check ((booking_id is not null) <> (car_id is not null));

-- Renter-callable counterpart to create_conversation_for_booking() (the
-- trigger booking creation already fires). Reuses an existing unresolved
-- inquiry for the same car+customer rather than spawning a new one every
-- time "Inquiry" is tapped again on the same car - matches the mental model
-- of one open thread per topic, same as how a real booking's conversation
-- is a singleton per booking.
create or replace function create_or_get_inquiry_conversation(p_car_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_support_user record;
begin
  select id into v_conversation_id
  from conversations
  where car_id = p_car_id and customer_id = auth.uid() and is_resolved = false
  order by created_at desc
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  insert into conversations (car_id, customer_id)
  values (p_car_id, auth.uid())
  returning id into v_conversation_id;

  insert into conversation_participants (conversation_id, user_id, role_in_conversation)
  values (v_conversation_id, auth.uid(), 'customer');

  for v_support_user in select id from users where is_support or role = 'admin' loop
    insert into conversation_participants (conversation_id, user_id, role_in_conversation)
    values (v_conversation_id, v_support_user.id, 'support')
    on conflict (conversation_id, user_id) do nothing;
  end loop;

  return v_conversation_id;
end;
$$;
revoke execute on function create_or_get_inquiry_conversation(uuid) from public;
grant execute on function create_or_get_inquiry_conversation(uuid) to authenticated;

-- list_conversations/get_conversation both did a hard `join bookings` -
-- fine when booking_id was guaranteed NOT NULL, but an inner join against a
-- NULL booking_id now silently drops every inquiry conversation from
-- list_conversations, and leaves get_conversation's v_booking an
-- all-null rowtype. Both switched to LEFT JOIN, with pinned_summary built
-- from the car-only anchor when there's no booking to pull one from.
create or replace function list_conversations(p_scope text default 'mine')
returns table (
  id uuid,
  booking_id uuid,
  created_at timestamptz,
  pinned_summary jsonb,
  last_message jsonb,
  unread_count int,
  is_resolved boolean,
  is_urgent boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_scope = 'all' and not is_support() then
    raise exception 'Only support may list all conversations';
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
        else
          jsonb_build_object(
            'carId', inquiry_car.id,
            'carImage', inquiry_car.images[1],
            'carName', inquiry_car.name,
            'status', 'inquiry',
            'customerName', customer.full_name
          )
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
      c.is_urgent
    from conversations c
    left join bookings b on b.id = c.booking_id
    left join cars booking_car on booking_car.id = b.car_id
    left join users renter on renter.id = b.renter_id
    left join cars inquiry_car on inquiry_car.id = c.car_id
    left join users customer on customer.id = c.customer_id
    where p_scope = 'all'
       or exists (
         select 1 from conversation_participants cp
         where cp.conversation_id = c.id and cp.user_id = auth.uid()
       )
    order by c.last_message_at desc nulls last, c.created_at desc;
end;
$$;

create or replace function get_conversation(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_can_view boolean;
  v_conversation conversations%rowtype;
  v_booking bookings%rowtype;
  v_car record;
  v_customer record;
  v_pinned jsonb;
  v_participants jsonb;
begin
  select exists (
    select 1 from conversation_participants
    where conversation_id = p_conversation_id and user_id = auth.uid()
  ) or is_support() into v_can_view;

  if not v_can_view then
    raise exception 'Not authorized to view this conversation';
  end if;

  select * into v_conversation from conversations where id = p_conversation_id;

  if v_conversation.booking_id is not null then
    select b.* into v_booking from bookings b where b.id = v_conversation.booking_id;
    select id, name, images into v_car from cars where id = v_booking.car_id;
    select full_name, avatar_url into v_customer from users where id = v_booking.renter_id;

    v_pinned := jsonb_build_object(
      'carId', v_car.id, 'carImage', v_car.images[1], 'carName', v_car.name, 'status', v_booking.status,
      'customerName', v_customer.full_name,
      'pickupDateTime', v_booking.start_date::text || ' ' || coalesce(v_booking.pickup_time, ''),
      'pickupAddress', v_booking.pickup_location,
      'returnDateTime', v_booking.end_date::text || ' ' || coalesce(v_booking.return_time, ''),
      'returnAddress', v_booking.return_location
    );

    if v_booking.renter_id = auth.uid() then
      v_pinned := v_pinned || jsonb_build_object(
        'totalCost', v_booking.total_cost,
        'paid', case when v_booking.payment_status = 'paid' then v_booking.total_cost else 0 end,
        'addonNames', to_jsonb(coalesce(v_booking.addon_names, '{}'::text[]))
      );
    end if;
  else
    select id, name, images into v_car from cars where id = v_conversation.car_id;
    select full_name, avatar_url into v_customer from users where id = v_conversation.customer_id;
    v_pinned := jsonb_build_object(
      'carId', v_car.id, 'carImage', v_car.images[1], 'carName', v_car.name, 'status', 'inquiry',
      'customerName', v_customer.full_name
    );
  end if;

  select jsonb_agg(jsonb_build_object(
    'userId', cp.user_id, 'name', u.full_name, 'avatar', u.avatar_url, 'role', cp.role_in_conversation
  ))
  into v_participants
  from conversation_participants cp join users u on u.id = cp.user_id
  where cp.conversation_id = p_conversation_id;

  return jsonb_build_object(
    'id', p_conversation_id, 'bookingId', v_conversation.booking_id, 'createdAt', v_conversation.created_at,
    'pinnedSummary', v_pinned, 'participants', coalesce(v_participants, '[]'::jsonb),
    'isResolved', coalesce(v_conversation.is_resolved, false), 'isUrgent', coalesce(v_conversation.is_urgent, false)
  );
end;
$$;
