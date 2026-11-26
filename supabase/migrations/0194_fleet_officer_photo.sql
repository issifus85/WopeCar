-- Fleet Officer: renters see the officer's own profile photo (the photo the officer sets on their WopeCar account), on the trip card,
-- the live map and next to the officer's messages in the booking chat.
--
-- Until now the photo was copied from the account once, when admin promoted the officer, so a photo added afterwards never showed.
-- The renter-facing functions below now read the account photo live, falling back to the copy taken at promotion.
-- Same columns and rules as before (0189 / 0191); only the photo value changes. Plus one new read-only function for the chat.
-- Safe to re-run.

-- ---- renter: who is coming (same as 0189 except the photo) -------------------------------------------------------------------
create or replace function public.renter_trip_officers(p_booking_id uuid)
returns table (task_id uuid, type text, status text, scheduled_at timestamptz, officer_name text, officer_photo text, officer_masked_phone text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.id, t.type, t.status, t.scheduled_at, o.display_name, coalesce(nullif(u.avatar_url, ''), o.photo_url), o.masked_phone
  from trip_tasks t
  join bookings b on b.id = t.booking_id and b.renter_id = auth.uid()
  join officer_profiles o on o.user_id = t.officer_id and o.is_active
  left join users u on u.id = o.user_id
  where t.booking_id = p_booking_id and t.status in ('assigned', 'accepted', 'en_route', 'arrived', 'inspecting')
  order by t.scheduled_at;
$$;
revoke all on function public.renter_trip_officers(uuid) from public, anon;
grant execute on function public.renter_trip_officers(uuid) to authenticated;

-- ---- renter: the live trip (same as 0191 except the photo) -------------------------------------------------------------------
create or replace function public.renter_trip_live(p_booking_id uuid default null, p_conversation_id uuid default null)
returns table (
  task_id uuid, booking_id uuid, type text, status text, officer_name text, officer_photo text, vehicle_note text,
  officer_lat double precision, officer_lng double precision, officer_heading double precision, location_at timestamptz,
  dest_lat double precision, dest_lng double precision, destination text,
  eta_seconds integer, eta_distance_m integer, eta_source text, eta_updated_at timestamptz, route_polyline text,
  sharing boolean, conversation_id uuid
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_booking uuid := p_booking_id;
begin
  if v_booking is null and p_conversation_id is not null then
    select c.booking_id into v_booking from conversations c where c.id = p_conversation_id;
  end if;
  if v_booking is null or not exists (select 1 from bookings where id = v_booking and renter_id = auth.uid()) then
    return;
  end if;
  return query
    select t.id, t.booking_id, t.type, t.status, o.display_name, coalesce(nullif(u.avatar_url, ''), o.photo_url), o.vehicle_note,
           t.last_lat, t.last_lng, t.last_heading, t.last_location_at,
           t.dest_lat, t.dest_lng, case when t.type = 'delivery' then t.to_address else t.from_address end,
           t.eta_seconds, t.eta_distance_m, t.eta_source, t.eta_updated_at, t.route_polyline,
           (t.status = 'en_route' and t.sharing_stopped_at is null),
           (select c.id from conversations c where c.booking_id = t.booking_id order by c.created_at limit 1)
    from trip_tasks t
    left join officer_profiles o on o.user_id = t.officer_id
    left join users u on u.id = o.user_id
    where t.booking_id = v_booking and t.status in ('en_route', 'arrived')
    order by t.scheduled_at nulls last;
end;
$$;
revoke all on function public.renter_trip_live(uuid, uuid) from public, anon;
grant execute on function public.renter_trip_live(uuid, uuid) to authenticated;

-- ---- chat: the photos of the officers in a conversation ---------------------------------------------------------------------
-- Read-only. Only for someone in the conversation (or support), only active officers invited into it. The app shows the photo
-- next to that officer's messages. The existing message list is unchanged.
create or replace function public.conversation_officer_photos(p_conversation_id uuid)
returns table (user_id uuid, photo_url text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select o.user_id, coalesce(nullif(u.avatar_url, ''), o.photo_url)
  from conversation_participants op
  join officer_profiles o on o.user_id = op.user_id and o.is_active
  left join users u on u.id = o.user_id
  where op.conversation_id = p_conversation_id
    and op.role_in_conversation = 'invited'
    and coalesce(nullif(u.avatar_url, ''), o.photo_url) is not null
    and (
      exists (select 1 from conversation_participants me where me.conversation_id = p_conversation_id and me.user_id = auth.uid())
      or is_support()
    );
$$;
revoke all on function public.conversation_officer_photos(uuid) from public, anon;
grant execute on function public.conversation_officer_photos(uuid) to authenticated;
