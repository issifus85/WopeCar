-- An inspection can now be started by the client (renter wizard) OR by an admin (booking details), both writing the same vehicle_inspections
-- row for the booking. Once it has been SUBMITTED it is a signed record, so neither a client nor a vendor may change it afterwards - for example a
-- client's stale local draft re-syncing over an inspection an admin already completed. Admins (and the service role / database functions, which
-- generate the PDF) are exempt.
create or replace function public.lock_submitted_inspection()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_status text; v_inspection uuid;
begin
  if current_user not in ('authenticated', 'anon') or is_admin() then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'vehicle_inspections' then
    v_status := old.status;
  else
    v_inspection := coalesce(new.inspection_id, old.inspection_id);
    select status into v_status from vehicle_inspections where id = v_inspection;
  end if;

  if v_status = 'submitted' then
    raise exception 'This inspection has already been submitted and can no longer be changed.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_lock_submitted_inspection on public.vehicle_inspections;
create trigger trg_lock_submitted_inspection before update on public.vehicle_inspections
  for each row execute function public.lock_submitted_inspection();

drop trigger if exists trg_lock_submitted_inspection_photos on public.vehicle_inspection_photos;
create trigger trg_lock_submitted_inspection_photos before insert or update or delete on public.vehicle_inspection_photos
  for each row execute function public.lock_submitted_inspection();

drop trigger if exists trg_lock_submitted_inspection_damage on public.vehicle_inspection_damage_points;
create trigger trg_lock_submitted_inspection_damage before insert or update or delete on public.vehicle_inspection_damage_points
  for each row execute function public.lock_submitted_inspection();
