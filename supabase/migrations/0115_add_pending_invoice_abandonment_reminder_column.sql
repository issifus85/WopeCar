-- One-shot guard (IS NULL check, not a lookback - this reminder fires at
-- most once per saved booking, unlike the recurring cart/national-id
-- reminders) for the new send-website-cart-abandonment-reminders cron,
-- which nudges a renter whose website "Save & Pay Later" hold
-- (pending_invoices) has sat unresolved for 3-5 days.
alter table pending_invoices add column if not exists abandonment_reminder_sent_at timestamptz;
