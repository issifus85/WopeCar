# Edge Function regression checks

Runs the real code of `cancel-booking` and `modify-booking` (from `supabase/functions/`) against an in-memory fake of Supabase and
Paystack, with booking numbers modelled on real bookings. Run it before deploying either function, or after changing any pricing,
deposit, promo, add-on or refund rule:

```bash
npm run test:edge
```

It covers: refund tiers with both the app's "9:00 AM" and the website's "09:00" pickup times, refunds after a paid modification,
who may cancel/modify, add-on days clamped to the billed days, the server rebuilding deposit/delivery/promo/total instead of trusting
the client, a paid price increase being rejected unless Paystack confirmed it, a deleted promo code keeping its discount, a car
re-labelled Chauffeur not changing a self-drive booking, and a driver for every day following an extended trip.

It does NOT cover real logins, real Paystack/QuickBooks calls, or the app/website screens. If you change a rule on purpose (deposit
percentage, refund windows, ...), update the expected numbers in `tests.cjs` to match.
