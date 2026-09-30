-- Guard column for the new weekly send-national-id-reminders cron -
-- lookback-based (not IS NULL), same idiom as
-- vendors.calendar_reminder_sent_at, so the reminder recurs every week
-- until the user has a documents row of type 'national_id' (checked in the
-- function itself, not derivable from national_id_status alone - that
-- column can't tell "never uploaded" apart from "uploaded, pending
-- review").
alter table users add column if not exists national_id_reminder_sent_at timestamptz;
