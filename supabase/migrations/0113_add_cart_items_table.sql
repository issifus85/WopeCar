-- Server-side mirror of the app's local "add to cart" wishlist (see
-- contexts/CartContext.js's cartIds - a plain car-id list) for signed-in
-- users only. The local cart itself stays the source of truth for the UI;
-- this table exists purely so send-cart-reminders (a new cron) has
-- something to query. One row per (user, car); reminder_sent_at is a
-- lookback-based guard (same idiom as vendors.calendar_reminder_sent_at)
-- so the reminder can repeat every 3 days rather than fire once ever.
create table if not exists cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  car_id uuid not null references cars(id) on delete cascade,
  created_at timestamptz not null default now(),
  reminder_sent_at timestamptz,
  unique (user_id, car_id)
);

alter table cart_items enable row level security;

create policy "Users manage own cart items" on cart_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
