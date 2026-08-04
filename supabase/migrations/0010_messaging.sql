-- Messaging: booking-anchored support chat, moved off Laravel (see the
-- "Laravel -> Supabase Data Migration, Phase 3: Messaging" plan). Phase 2's
-- bookings cutover silently broke this feature - Laravel used to create a
-- conversation inline in BookingApiController::store(), but new bookings
-- never reach that endpoint anymore, so no conversation has existed for any
-- booking made through the app since. This migration makes conversation
-- creation happen automatically on the Supabase side instead.

-- Mirrors is_admin()'s exact style/shape. role='admin' is folded in to match
-- the original Laravel semantics (role_id===1 also granted Staff Inbox
-- access automatically; is_support stays available as a manual grant for a
-- non-admin support agent).
create or replace function is_support()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from users where id = auth.uid() and (is_support or role = 'admin')
  );
$$;

create table conversations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references bookings(id) on delete cascade,
  customer_id uuid not null references users(id),
  last_message_at timestamptz,
  last_message_preview text,
  last_message_sender_id uuid references users(id),
  created_at timestamptz not null default now()
);

create table conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role_in_conversation text not null check (role_in_conversation in ('customer', 'support', 'invited')),
  invited_by_user_id uuid references users(id),
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create table conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references users(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index conversation_messages_conv_created_idx on conversation_messages (conversation_id, created_at);

-- No sender_name/sender_is_support columns here - Laravel computed those
-- live from sender_id on every read (so a display-name change or an
-- is_support flip is reflected on old messages too). The RPCs below join
-- users live inside a security definer function instead of denormalizing,
-- matching that behavior without needing a broad users SELECT policy.

-- Reuse the existing (pre-existing, previously-unused) notifications table
-- for one-way host notifications - its shape already matches what Laravel's
-- messaging_notifications had. Just add the conversation_id column for
-- traceability (on delete set null, not cascade/restrict - a notification
-- should never block a conversation's deletion, same "don't let this
-- secondary record block the real thing" reasoning already applied to
-- booking_id having no FK at all).
alter table notifications add column conversation_id uuid references conversations(id) on delete set null;

-- The original messages table (0001_initial_schema.sql) is dead schema -
-- flat sender/receiver/booking with no conversation grouping, no
-- participants, zero code references anywhere in the app. Superseded in
-- function by conversation_messages above.
drop table messages;

alter table conversations enable row level security;
alter table conversation_participants enable row level security;
alter table conversation_messages enable row level security;

-- No select/insert/update policy for plain authenticated on any of the
-- three tables - every client read/write goes through the security definer
-- RPCs below, which bypass RLS the same way restrict_renter_booking_update()
-- already does (function executes as the owning role). Only a direct
-- dashboard/debugging admin path is exposed at the table level, matching
-- every other table's *_admin_all convention in this schema.
create policy conversations_admin_all on conversations for all to authenticated
  using (is_admin()) with check (is_admin());
create policy conversation_participants_admin_all on conversation_participants for all to authenticated
  using (is_admin()) with check (is_admin());
create policy conversation_messages_admin_all on conversation_messages for all to authenticated
  using (is_admin()) with check (is_admin());

-- Postgres grants EXECUTE to PUBLIC by default on function creation, and
-- the existing is_admin()/is_vendor_owner() never revoke it - harmless
-- there since they're only ever called from inside policies/triggers. This
-- migration is the first time this project exposes security definer
-- functions directly to PostgREST as callable RPCs, so each one explicitly
-- revokes the PUBLIC grant first (every function still gates on auth.uid()
-- internally, so this isn't a real hole today, but there's no reason to
-- leave anon-callable surface area lying around, especially for a function
-- that runs an ilike scan over users).

create or replace function list_conversations(p_scope text default 'mine')
returns table (
  id uuid,
  booking_id uuid,
  created_at timestamptz,
  pinned_summary jsonb,
  last_message jsonb,
  unread_count int
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
      jsonb_build_object(
        'carImage', car.images[1],
        'carName', car.name,
        'status', b.status,
        'customerName', u.full_name,
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
      else '{}'::jsonb end as pinned_summary,
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
      ) as unread_count
    from conversations c
    join bookings b on b.id = c.booking_id
    join cars car on car.id = b.car_id
    join users u on u.id = b.renter_id
    where p_scope = 'all'
       or exists (
         select 1 from conversation_participants cp
         where cp.conversation_id = c.id and cp.user_id = auth.uid()
       )
    order by c.last_message_at desc nulls last, c.created_at desc;
end;
$$;
revoke execute on function list_conversations(text) from public;
grant execute on function list_conversations(text) to authenticated;

create or replace function get_conversation(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_can_view boolean;
  v_booking bookings%rowtype;
  v_car record;
  v_customer record;
  v_pinned jsonb;
  v_participants jsonb;
  v_created_at timestamptz;
begin
  select exists (
    select 1 from conversation_participants
    where conversation_id = p_conversation_id and user_id = auth.uid()
  ) or is_support() into v_can_view;

  if not v_can_view then
    raise exception 'Not authorized to view this conversation';
  end if;

  -- Two separate selects rather than `select b.*, c.created_at into
  -- v_booking, v_created_at` - PL/pgSQL's INTO maps result columns
  -- positionally against ALL targets, so mixing a `.*` expansion with a
  -- second scalar target in one INTO clause does not fold b's columns into
  -- the rowtype variable the way it looks like it would.
  select created_at into v_created_at from conversations where id = p_conversation_id;
  select b.* into v_booking from bookings b join conversations c on c.booking_id = b.id where c.id = p_conversation_id;

  select name, images into v_car from cars where id = v_booking.car_id;
  select full_name, avatar_url into v_customer from users where id = v_booking.renter_id;

  v_pinned := jsonb_build_object(
    'carImage', v_car.images[1], 'carName', v_car.name, 'status', v_booking.status,
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

  select jsonb_agg(jsonb_build_object(
    'userId', cp.user_id, 'name', u.full_name, 'avatar', u.avatar_url, 'role', cp.role_in_conversation
  ))
  into v_participants
  from conversation_participants cp join users u on u.id = cp.user_id
  where cp.conversation_id = p_conversation_id;

  return jsonb_build_object(
    'id', p_conversation_id, 'bookingId', v_booking.id, 'createdAt', v_created_at,
    'pinnedSummary', v_pinned, 'participants', coalesce(v_participants, '[]'::jsonb)
  );
end;
$$;
revoke execute on function get_conversation(uuid) from public;
grant execute on function get_conversation(uuid) to authenticated;

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
  -- `where cp.conversation_id = ...` (table-alias-qualified) - RETURNS
  -- TABLE's output columns (id, conversation_id, ...) are implicitly
  -- in-scope PL/pgSQL variables for the whole function body, so an
  -- unqualified `conversation_id` here is ambiguous between that and
  -- conversation_participants.conversation_id.
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
      -- "Read" means read by any participant OTHER THAN the message's own
      -- sender (multi-party semantics, matching the original Laravel
      -- behavior) - keyed off each row's sender_id, not the calling
      -- viewer, so this stays correct even for a 3+-party thread.
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
revoke execute on function list_conversation_messages(uuid) from public;
grant execute on function list_conversation_messages(uuid) to authenticated;

create or replace function send_conversation_message(p_conversation_id uuid, p_body text)
returns conversation_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_participant boolean;
  v_message conversation_messages;
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

  insert into conversation_messages (conversation_id, sender_id, body)
  values (p_conversation_id, auth.uid(), p_body)
  returning * into v_message;

  update conversations set
    last_message_at = v_message.created_at,
    last_message_preview = left(p_body, 200),
    last_message_sender_id = auth.uid()
  where id = p_conversation_id;

  return v_message;
end;
$$;
revoke execute on function send_conversation_message(uuid, text) from public;
grant execute on function send_conversation_message(uuid, text) to authenticated;

create or replace function mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_participant boolean;
begin
  select exists (
    select 1 from conversation_participants
    where conversation_id = p_conversation_id and user_id = auth.uid()
  ) into v_is_participant;

  if not v_is_participant then
    -- Raise, don't silently no-op, for a caller who's neither a
    -- participant nor support - mirrors send_conversation_message's gate
    -- exactly so an unauthorized caller always gets a hard failure rather
    -- than an update that silently touches zero rows.
    if is_support() then
      insert into conversation_participants (conversation_id, user_id, role_in_conversation)
      values (p_conversation_id, auth.uid(), 'support')
      on conflict (conversation_id, user_id) do nothing;
    else
      raise exception 'You are not a participant of this conversation';
    end if;
  end if;

  update conversation_participants set last_read_at = now()
  where conversation_id = p_conversation_id and user_id = auth.uid();
end;
$$;
revoke execute on function mark_conversation_read(uuid) from public;
grant execute on function mark_conversation_read(uuid) to authenticated;

create or replace function search_participant_candidates(p_conversation_id uuid, p_query text)
returns table (id uuid, name text, avatar text, email text)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_support() then
    raise exception 'Only support may search participant candidates';
  end if;

  return query
    select u.id, u.full_name, u.avatar_url, u.email
    from users u
    where (u.full_name ilike '%' || p_query || '%' or u.email ilike '%' || p_query || '%')
      and not exists (
        select 1 from conversation_participants cp
        where cp.conversation_id = p_conversation_id and cp.user_id = u.id
      )
      -- The host must never become a participant (one-way notification
      -- only) - excluded from candidates so staff can't accidentally
      -- invite them. Neither the original Laravel endpoint nor this
      -- table's shape prevented this on their own.
      and not exists (
        select 1 from conversations c
        join bookings b on b.id = c.booking_id
        join vendors v on v.id = b.vendor_id
        where c.id = p_conversation_id and v.user_id = u.id
      )
    limit 20;
end;
$$;
revoke execute on function search_participant_candidates(uuid, text) from public;
grant execute on function search_participant_candidates(uuid, text) to authenticated;

create or replace function invite_conversation_participant(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
end;
$$;
revoke execute on function invite_conversation_participant(uuid, uuid) from public;
grant execute on function invite_conversation_participant(uuid, uuid) to authenticated;

-- Fires on the existing plain `insert into bookings` from createBooking()
-- (services/supabaseApi.js) - no client change needed for a conversation to
-- "just happen". Fires at the reserve step (before Paystack payment
-- completes), confirmed against the real Laravel controller to match
-- original behavior exactly - it also created the conversation
-- unconditionally, before checking payment status.
--
-- The whole body is wrapped in its own exception handler. Laravel wrapped
-- Conversation::createForBooking() in try/catch specifically so a
-- messaging failure could never turn a successful booking into a failed
-- API response - but a plain AFTER INSERT trigger has no such isolation by
-- default: an unhandled exception here would roll back the booking insert
-- itself too. This restores that same "booking always succeeds, messaging
-- is best-effort" guarantee.
create or replace function create_conversation_for_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_support_user record;
  v_vendor_user_id uuid;
begin
  begin
    insert into conversations (booking_id, customer_id)
    values (new.id, new.renter_id)
    returning id into v_conversation_id;

    insert into conversation_participants (conversation_id, user_id, role_in_conversation)
    values (v_conversation_id, new.renter_id, 'customer');

    for v_support_user in select id from users where is_support or role = 'admin' loop
      insert into conversation_participants (conversation_id, user_id, role_in_conversation)
      values (v_conversation_id, v_support_user.id, 'support')
      on conflict (conversation_id, user_id) do nothing;
    end loop;

    select user_id into v_vendor_user_id from vendors where id = new.vendor_id;
    if v_vendor_user_id is not null then
      insert into notifications (user_id, type, title, body, booking_id, conversation_id)
      values (
        v_vendor_user_id, 'booking_created_host', 'New booking request',
        'You have a new booking request for one of your cars.', new.id, v_conversation_id
      );
    end if;
  exception when others then
    raise warning 'create_conversation_for_booking failed for booking %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

create trigger bookings_create_conversation
  after insert on bookings
  for each row execute function create_conversation_for_booking();
