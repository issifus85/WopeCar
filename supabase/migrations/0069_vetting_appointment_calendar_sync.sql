-- Google Calendar sync for vendor vetting appointments. The appointment
-- date/time already gets persisted to cars.vetting_date/vetting_time on
-- listing submission (0014_vendor_cars_write_path.sql) - what's missing is
-- an actual calendar event, any admin visibility into these appointments,
-- and a reminder/notification flow. This adds the columns the new
-- calendar-* Edge Functions (wopecar-admin/supabase/functions/) read/write.
--
-- appointment_status is a separate lifecycle from cars.status (which has
-- only ever been active/pending/inactive, never touched for this) - same
-- 4-value shape bookings.status already uses. There's no 'rescheduled'
-- resting state: the calendar-create-appointment function creates the
-- Google event immediately on submission (that IS the confirmation), and a
-- reschedule just re-confirms at a new time.
alter table cars
  add column appointment_status text not null default 'pending'
    check (appointment_status in ('pending', 'confirmed', 'cancelled', 'completed')),
  add column appointment_start_at timestamptz,
  add column appointment_end_at timestamptz,
  add column appointment_location text,
  add column appointment_notes text,
  add column google_calendar_event_id text,
  add column google_calendar_event_url text,
  add column appointment_reminder_sent_at timestamptz;

-- Scoped to only the rows the reminder cron and slot-availability lookup
-- actually scan, not every car.
create index cars_appointment_start_at_idx on cars (appointment_start_at)
  where appointment_status in ('pending', 'confirmed');

-- operations_lead_email is a new app_settings key (mirrors support_email/
-- support_address's existing pattern exactly - same table, same RLS, not
-- sensitive) - the calendar invite attendee. No new key needed for the
-- appointment location - the existing support_address key already covers
-- "WopeCar office address". operations_support_email is deliberately left
-- unseeded (optional cc, added via Settings -> Contact once provided).
insert into app_settings (key, value, description) values
  ('operations_lead_email', '"maureen@wopecar.com"'::jsonb, 'Calendar invite attendee for vetting appointments.')
on conflict (key) do nothing;
