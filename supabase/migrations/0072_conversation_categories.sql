-- Admin-side split: "Inbox" should show only general conversations (no
-- booking/car anchor - today, exactly vendor-support conversations),
-- "Ride Support" should show only booking/inquiry conversations. Both
-- previously called this same RPC with no category filter, so they showed
-- an identical, undifferentiated mix. Filtering happens here (on the real
-- anchor columns, not the derived pinned_summary.status string) rather than
-- client-side, keeping the category logic centralized alongside the rest of
-- this function's branching, same as every other list_*/get_conversation*
-- RPC in this file's lineage (0010/0042/0067).
create or replace function list_conversations(
  p_scope text default 'mine',
  p_category text default null  -- null = unfiltered (legacy behavior); 'general' | 'support_ops'
)
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
      c.is_urgent
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
