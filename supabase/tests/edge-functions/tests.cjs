// Pricing / refund regression checks for the cancel-booking and modify-booking Edge Functions. Run: npm run test:edge
const { makeDb, loadFunction } = require('./harness.cjs');
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra)); };

const pad = (n) => String(n).padStart(2, '0');
function when(hoursFromNow) {
  const d = new Date(Date.now() + hoursFromNow * 3600000);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const h = d.getHours(), m = d.getMinutes();
  const t24 = `${pad(h)}:${pad(m)}`;
  const t12 = `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
  return { date, t24, t12 };
}
const req = (body, auth = 'Bearer x') => new Request('https://x/fn', { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// ============================== cancel-booking ==============================
async function runCancel({ pickup, total = 3000, deposit = 600, status = 'pending', callerId = 'R', mods = [] }) {
  const tables = {
    users: [{ id: 'R', role: 'renter' }, { id: 'A', role: 'admin' }],
    vendors: [{ id: 'V', user_id: 'VU' }],
    bookings: [{ id: 'B1', booking_ref: 'WC-T-1', renter_id: 'R', vendor_id: 'V', status, payment_status: 'paid', payment_ref: 'ps_main', total_cost: total, security_deposit: deposit, start_date: pickup.date, pickup_time: pickup.time }],
    app_settings: [{ key: 'cancellation_full_refund_hours', value: 48 }, { key: 'cancellation_partial_refund_hours', value: 24 }, { key: 'cancellation_partial_refund_percentage', value: 0.5 }],
    booking_modifications: mods, notifications: [],
  };
  const { client, log } = makeDb(tables);
  const refunds = [];
  const fetchStub = async (url, opts) => {
    if (String(url).includes('api.paystack.co/refund')) { refunds.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({ status: true }) }; }
    return { ok: true, json: async () => ({}) };
  };
  const handler = loadFunction('cancel-booking/index.ts', { createClient: (url, key, o) => client(o?.global ? callerId : null), env: { SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's', PAYSTACK_SECRET_KEY: 'k' }, fetch: fetchStub });
  const res = await handler(req({ bookingId: 'B1', reason: 't' }));
  return { status: res.status, body: await res.json(), refunds, tables };
}

(async () => {
  console.log('--- cancel-booking (TZ=' + process.env.TZ + ') ---');
  for (const [label, hrs, expectPct, expectAmt] of [['10 days ahead', 240, 1, 3000], ['30h ahead (partial window)', 30, 0.5, 1800], ['10h ahead (no-refund window)', 10, 0, 600]]) {
    const w = when(hrs);
    for (const fmt of ['t12', 't24']) {
      const r = await runCancel({ pickup: { date: w.date, time: w[fmt] } });
      check(`cancel ${label}, pickup "${w[fmt]}" -> ${expectPct * 100}% tier, GHS ${expectAmt}`, r.body.refundPercentage === expectPct && r.body.refundAmount === expectAmt && r.body.success, JSON.stringify(r.body));
    }
  }
  // a booking modified earlier: paid base = original total + amounts charged; deposit returned in full
  {
    const w = when(10);
    const r = await runCancel({ pickup: { date: w.date, time: w.t12 }, total: 5000, deposit: 700, mods: [{ booking_id: 'B1', old_total_cost: 3000, old_security_deposit: 600, amount_charged: 2000, payment_ref: 'ps_mod', created_at: '2026-10-01' }] });
    check('cancel after a paid modification, no-refund window -> only the deposit actually paid (600) returned', r.body.refundAmount === 600, JSON.stringify(r.body));
  }
  // renter cannot cancel a confirmed booking; other user cannot cancel
  { const w = when(100); const r = await runCancel({ pickup: { date: w.date, time: w.t12 }, status: 'confirmed' }); check('renter cannot cancel a confirmed booking (403)', r.status === 403, JSON.stringify(r.body)); }
  { const w = when(100); const r = await runCancel({ pickup: { date: w.date, time: w.t12 }, callerId: 'STRANGER' }); check('a stranger cannot cancel (403)', r.status === 403, JSON.stringify(r.body)); }

  // ============================== modify-booking ==============================
  console.log('--- modify-booking ---');
  const settings = [
    { key: 'self_drive_delivery_fee', value: 250 }, { key: 'chauffeur_security_deposit', value: 500 }, { key: 'security_deposit_threshold', value: 2000 },
    { key: 'security_deposit_flat', value: 500 }, { key: 'security_deposit_percentage', value: 0.25 }, { key: 'with_driver_fee_per_day', value: 300 },
  ];
  const DEFS = [{ name: 'Volta', type: 'per_day', price: 350 }, { name: 'Eastern', type: 'per_day', price: 350 }];
  const baseBooking = () => ({
    id: 'B1', booking_ref: 'WC-T-2', renter_id: 'R', car_id: 'C1', status: 'confirmed', payment_status: 'paid', drive_type: 'Self-drive',
    start_date: '2026-12-10', end_date: '2026-12-15', pickup_time: '10:00 AM', return_time: '10:00 AM', billable_days: 5,
    rental_cost: 6818, addons_cost: 1750, addon_names: ['Volta'], addon_days: [5], delivery_fee: 250, security_deposit: 2142, wopecare_total_cost: 540,
    with_driver: false, with_driver_total_cost: 0, with_driver_daily_rate: 0, with_driver_days: null, promo_code: null, promo_discount_amount: 0, total_cost: 11500,
    cars: { name: 'Toyota 4-Runner', drive_type: 'Self-drive' }, renter: { id: 'R', full_name: 'T', email: 't@example.com' },
  });
  async function runModify({ booking = baseBooking(), body, callerId = 'R', paystack = null, car = { id: 'C1', price_per_day: 1550, regional_addons: DEFS }, promos = [] }) {
    const tables = {
      users: [{ id: 'R', role: 'renter' }, { id: 'A', role: 'admin' }], bookings: [booking], cars: [car], app_settings: settings, promo_codes: promos,
      car_payouts: [{ car_id: 'C1', payout_per_day: 1000 }], car_date_prices: [], booking_modifications: [], notifications: [], internal_secrets: [],
    };
    const { client, log } = makeDb(tables);
    const fetchStub = async (url) => {
      if (String(url).includes('/transaction/verify/')) return { ok: true, json: async () => paystack ?? { status: false } };
      return { ok: true, json: async () => ({}) };
    };
    const handler = loadFunction('modify-booking/index.ts', { createClient: (u, k, o) => client(o?.global ? callerId : null), env: { SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's', PAYSTACK_SECRET_KEY: 'k', RESEND_API_KEY: '' }, fetch: fetchStub });
    const res = await handler(req({ bookingId: 'B1', ...body }));
    return { status: res.status, body: await res.json(), booking: tables.bookings[0], log, tables };
  }
  const dates = (s, e) => ({ startDate: s, endDate: e, pickupTime: '10:00 AM', returnTime: '10:00 AM', pickupLocation: 'A', returnLocation: 'A' });

  // 1. shorten 5 -> 3 days, client sends WRONG (stale) totals; server must re-price add-ons (3 days), deposit, total.
  {
    const r = await runModify({ body: { ...dates('2026-12-10', '2026-12-13'), billableDays: 3, rentalCost: 4091, addonsCost: 1750, deliveryFee: 250, securityDeposit: 2142, wopecareTotalCost: 324, totalCost: 99999, amountCharged: 0 } });
    // rental 4091 + addons 3*350=1050 -> subtotal 5141 -> deposit 25% = 1285.25 ; total = 4091+1050+250+1285.25+324
    const exp = 4091 + 1050 + 250 + 1285.25 + 324;
    check('shorten 5->3 days: add-on days clamp to 3 and are saved', JSON.stringify(r.booking.addon_days) === '[3]' && r.booking.addons_cost === 1050, JSON.stringify([r.booking.addon_days, r.booking.addons_cost, r.body]));
    check('shorten 5->3 days: server rebuilds the deposit and total (ignores the client total)', r.booking.security_deposit === 1285.25 && r.booking.total_cost === exp, `got deposit ${r.booking.security_deposit} total ${r.booking.total_cost} exp ${exp}`);
    check('shorten 5->3 days: vendor payout & margin recomputed', r.booking.vendor_payout_total === 3000 && r.booking.wopecar_margin === exp - 3000, JSON.stringify([r.booking.vendor_payout_total, r.booking.wopecar_margin]));
    check('shorten 5->3 days: mismatch is logged to the price audit', r.log.rpcs.some((x) => x.name === 'log_booking_price_audit' && x.args.p_flags.includes('modify_total_mismatch')));
  }
  // 2. paid renter extends (price goes UP) without any Paystack payment -> 409
  {
    const r = await runModify({ body: { ...dates('2026-12-10', '2026-12-17'), billableDays: 7, rentalCost: 9545, wopecareTotalCost: 756, totalCost: 5000, amountCharged: 0 } });
    check('paid increase with no Paystack confirmation is rejected (409)', r.status === 409 && !r.log.updates.some((u) => u.table === 'bookings'), JSON.stringify([r.status, r.body]));
  }
  // 3. same increase, Paystack verified for exactly the difference -> accepted
  {
    const body = { ...dates('2026-12-10', '2026-12-17'), billableDays: 7, rentalCost: 9545, wopecareTotalCost: 756, paystackReference: 'ref1' };
    // server total: rental 9545 + addons min(5,7)=5*350=1750 + delivery 250 + deposit 0.25*(9545+1750)=2823.75 + 756
    const serverTotal = 9545 + 1750 + 250 + 2823.75 + 756; const diff = serverTotal - 11500;
    const r = await runModify({ body: { ...body, totalCost: serverTotal, amountCharged: diff }, paystack: { status: true, data: { status: 'success', amount: Math.round(diff * 100) } } });
    check('paid increase confirmed by Paystack for the right difference is accepted', r.status === 200 && r.booking.total_cost === serverTotal, JSON.stringify([r.status, r.body, r.booking.total_cost, serverTotal]));
    // 3b. Paystack confirmed less than the increase
    const r2 = await runModify({ body: { ...body, totalCost: serverTotal, amountCharged: 100 }, paystack: { status: true, data: { status: 'success', amount: 10000 } } });
    check('paid increase where Paystack confirmed less than the difference is rejected (409)', r2.status === 409, JSON.stringify([r2.status, r2.body]));
  }
  // 4. client claims a tiny rental on a paid booking (tamper) -> rejected by the rental floor
  {
    const r = await runModify({ body: { ...dates('2026-12-10', '2026-12-13'), billableDays: 3, rentalCost: 100, wopecareTotalCost: 324, totalCost: 100, amountCharged: 0 } });
    check('tampered tiny rental is rejected (400)', r.status === 400, JSON.stringify([r.status, r.body]));
  }
  // 5. promo: percentage promo is re-priced against the new base; deleted promo code keeps the stored discount
  {
    const mk = () => { const b = baseBooking(); b.promo_code = 'TEN'; b.promo_discount_amount = 856.8; b.total_cost = 11500 - 856.8; return b; };
    const r = await runModify({ booking: mk(), body: { ...dates('2026-12-10', '2026-12-13'), billableDays: 3, rentalCost: 4091, wopecareTotalCost: 324, totalCost: 1, amountCharged: 0 }, promos: [{ code: 'TEN', discount_type: 'percentage', discount_value: 10 }] });
    check('promo 10% re-priced on rental + add-ons (4091+1050 -> 514.1)', r.booking.promo_discount_amount === 514.1, String(r.booking.promo_discount_amount));
    const r2 = await runModify({ booking: mk(), body: { ...dates('2026-12-10', '2026-12-13'), billableDays: 3, rentalCost: 4091, wopecareTotalCost: 324, totalCost: 1, amountCharged: 0 }, promos: [] });
    check('promo code deleted after use: the booking keeps its discount (856.80) instead of losing it', r2.booking.promo_discount_amount === 856.8, String(r2.booking.promo_discount_amount));
  }
  // 6. car re-labelled Chauffeur later must not change a self-drive booking (25% deposit, delivery fee stay)
  {
    const b = baseBooking(); b.cars = { name: 'x', drive_type: 'Chauffeur' };
    const r = await runModify({ booking: b, body: { ...dates('2026-12-10', '2026-12-13'), billableDays: 3, rentalCost: 4091, wopecareTotalCost: 324, totalCost: 1, amountCharged: 0 } });
    check('self-drive booking on a car later labelled Chauffeur keeps delivery 250 and the 25% deposit', r.booking.delivery_fee === 250 && r.booking.security_deposit === 1285.25, JSON.stringify([r.booking.delivery_fee, r.booking.security_deposit]));
  }
  // 7. driver for every day follows the new trip length when the client does not send a driver choice (the WC-2026-1570 case)
  {
    const b = baseBooking(); b.with_driver = true; b.with_driver_daily_rate = 300; b.with_driver_total_cost = 600; b.with_driver_days = null; b.delivery_fee = 0; b.security_deposit = 500; b.addon_names = []; b.addon_days = []; b.addons_cost = 0; b.wopecare_total_cost = 0; b.rental_cost = 2400; b.billable_days = 2; b.total_cost = 3500;
    const r = await runModify({ booking: b, callerId: 'A', body: { ...dates('2026-12-10', '2026-12-14'), billableDays: 4, rentalCost: 4800, totalCost: 5400, amountCharged: 0 }, car: { id: 'C1', price_per_day: 1200, regional_addons: DEFS } });
    check('extending a trip with a driver for every day re-prices the driver to 4 days (1200), not the old 600', r.booking.with_driver_total_cost === 1200 && r.booking.total_cost === 4800 + 1200 + 500, JSON.stringify([r.booking.with_driver_total_cost, r.booking.total_cost]));
  }
  // 7b. ADD a driver to a plain self-drive booking: the whole booking switches to chauffeur rules (stored as drive_type 'Chauffeur'): driver
  // covers every billed 12-hour unit, no delivery fee, flat GHS 500 deposit. (The client has already counted 12-hour units: 4 here.)
  {
    const b = baseBooking(); b.addon_names = []; b.addon_days = []; b.addons_cost = 0; b.wopecare_total_cost = 0; b.delivery_fee = 250; b.security_deposit = 1000; b.rental_cost = 4000; b.billable_days = 4; b.total_cost = 4000 + 250 + 1000;
    const r = await runModify({ booking: b, callerId: 'A', body: { ...dates('2026-12-10', '2026-12-12'), billableDays: 5, rentalCost: 5000, wopecareTotalCost: 0, withDriver: true, withDriverTotalCost: 1500, totalCost: 7000, amountCharged: 0 }, car: { id: 'C1', price_per_day: 1000, regional_addons: DEFS } });
    check('adding a driver switches the booking to chauffeur rules (drive_type, no delivery, GHS 500 deposit, driver = units x rate, days null)',
      r.status === 200 && r.booking.drive_type === 'Chauffeur' && r.booking.delivery_fee === 0 && r.booking.security_deposit === 500 && r.booking.with_driver === true
      && r.booking.with_driver_total_cost === 1500 && r.booking.with_driver_days === null && r.booking.total_cost === 5000 + 1500 + 500, JSON.stringify([r.status, r.body, r.booking.drive_type, r.booking.delivery_fee, r.booking.security_deposit, r.booking.with_driver_total_cost, r.booking.total_cost]));
  }
  // 7c. REMOVE the driver from a chauffeur-rules (driver) booking: back to self-drive rules - delivery fee and the 25% deposit return.
  {
    const b = baseBooking(); b.drive_type = 'Chauffeur'; b.cars = { name: 'x', drive_type: 'Self-drive' }; b.with_driver = true; b.with_driver_daily_rate = 300; b.with_driver_total_cost = 1200; b.with_driver_days = null; b.delivery_fee = 0; b.security_deposit = 500; b.addon_names = []; b.addon_days = []; b.addons_cost = 0; b.wopecare_total_cost = 0; b.rental_cost = 4000; b.billable_days = 4; b.total_cost = 5700;
    const r = await runModify({ booking: b, callerId: 'A', body: { ...dates('2026-12-10', '2026-12-14'), billableDays: 4, rentalCost: 4000, wopecareTotalCost: 0, withDriver: false, withDriverTotalCost: 0, totalCost: 1, amountCharged: 0 }, car: { id: 'C1', price_per_day: 1000, regional_addons: DEFS } });
    check('removing the driver returns the booking to self-drive rules (drive_type, delivery 250, 25% deposit, no driver cost)',
      r.status === 200 && r.booking.drive_type === 'Self-drive' && r.booking.delivery_fee === 250 && r.booking.security_deposit === 1000 && r.booking.with_driver === false && r.booking.with_driver_total_cost === 0 && r.booking.total_cost === 4000 + 250 + 1000,
      JSON.stringify([r.status, r.body, r.booking.drive_type, r.booking.delivery_fee, r.booking.security_deposit, r.booking.with_driver_total_cost, r.booking.total_cost]));
  }
  // 7d. Extending a driver-rules booking without the client restating the driver (an older app build): the driver still covers every NEW unit.
  {
    const b = baseBooking(); b.drive_type = 'Chauffeur'; b.cars = { name: 'x', drive_type: 'Self-drive' }; b.with_driver = true; b.with_driver_daily_rate = 300; b.with_driver_total_cost = 600; b.with_driver_days = null; b.delivery_fee = 0; b.security_deposit = 500; b.addon_names = []; b.addon_days = []; b.addons_cost = 0; b.wopecare_total_cost = 0; b.rental_cost = 2000; b.billable_days = 2; b.total_cost = 3100;
    const r = await runModify({ booking: b, callerId: 'A', body: { ...dates('2026-12-10', '2026-12-13'), billableDays: 4, rentalCost: 4000, totalCost: 1, amountCharged: 0 }, car: { id: 'C1', price_per_day: 1000, regional_addons: DEFS } });
    check('extending a driver-rules booking re-prices the driver over the new 4 units (1200) and keeps chauffeur rules', r.booking.with_driver_total_cost === 1200 && r.booking.drive_type === 'Chauffeur' && r.booking.delivery_fee === 0 && r.booking.total_cost === 4000 + 1200 + 500, JSON.stringify([r.booking.with_driver_total_cost, r.booking.drive_type, r.booking.total_cost]));
  }
  // 7e. A genuine chauffeur CAR booking is untouched by the driver switch.
  {
    const b = baseBooking(); b.drive_type = 'Chauffeur'; b.cars = { name: 'x', drive_type: 'Chauffeur' }; b.delivery_fee = 0; b.security_deposit = 500; b.addon_names = []; b.addon_days = []; b.addons_cost = 0; b.wopecare_total_cost = 0; b.rental_cost = 3600; b.billable_days = 2; b.total_cost = 4100;
    const r = await runModify({ booking: b, callerId: 'A', body: { ...dates('2026-12-10', '2026-12-10'), billableDays: 3, rentalCost: 5400, withDriver: true, totalCost: 1, amountCharged: 0 }, car: { id: 'C1', price_per_day: 1800, regional_addons: DEFS } });
    check('a chauffeur car booking stays chauffeur with no separate driver charge', r.booking.drive_type === 'Chauffeur' && r.booking.with_driver_total_cost === 0 && r.booking.total_cost === 5400 + 500, JSON.stringify([r.booking.drive_type, r.booking.with_driver_total_cost, r.booking.total_cost]));
  }
  // 8. a stranger cannot modify; a cancelled booking cannot be modified
  { const r = await runModify({ callerId: 'S', body: { ...dates('2026-12-10', '2026-12-13'), billableDays: 3, rentalCost: 4091, totalCost: 1 } }); check('a stranger cannot modify (403)', r.status === 403, JSON.stringify([r.status, r.body])); }
  { const b = baseBooking(); b.status = 'cancelled'; const r = await runModify({ booking: b, body: { ...dates('2026-12-10', '2026-12-13'), billableDays: 3, rentalCost: 4091, totalCost: 1 } }); check('a cancelled booking cannot be modified (400)', r.status === 400, JSON.stringify([r.status, r.body])); }
  // 9. staff (admin) can lower/raise without payment
  { const r = await runModify({ callerId: 'A', body: { ...dates('2026-12-10', '2026-12-17'), billableDays: 7, rentalCost: 9545, wopecareTotalCost: 756, totalCost: 1, amountCharged: 0 } }); check('admin can raise a paid booking without a Paystack charge (balance collected separately)', r.status === 200, JSON.stringify([r.status, r.body])); }

  // 10. balance due: staff raise a paid booking with no payment -> the shortfall becomes bookings.balance_due and the renter is told
  {
    const r = await runModify({ callerId: 'A', body: { ...dates('2026-12-10', '2026-12-17'), billableDays: 7, rentalCost: 9545, wopecareTotalCost: 756, totalCost: 1, amountCharged: 0 } });
    const serverTotal = 9545 + 1750 + 250 + 2823.75 + 756; const diff = Math.round((serverTotal - 11500) * 100) / 100;
    check('staff raising a paid booking records the difference as balance_due', r.status === 200 && r.booking.balance_due === diff && r.body.balanceDue === diff, JSON.stringify([r.status, r.booking.balance_due, diff]));
    const note = r.tables.notifications.find((n) => n.type === 'booking_modified');
    check('the renter notification says a balance is due, with the amount', !!note && note.title.includes('balance due') && note.body.includes('Balance due'), JSON.stringify(note));
  }
  {
    const r = await runModify({ callerId: 'A', body: { ...dates('2026-12-10', '2026-12-13'), billableDays: 3, rentalCost: 4091, wopecareTotalCost: 324, totalCost: 1, amountCharged: 0 } });
    check('staff lowering a paid booking leaves no balance due', r.status === 200 && !(r.booking.balance_due > 0), JSON.stringify([r.status, r.booking.balance_due]));
  }
  {
    // an existing balance is reduced by a later reduction, never below zero
    const b = baseBooking(); b.balance_due = 400;
    const r = await runModify({ booking: b, callerId: 'A', body: { ...dates('2026-12-10', '2026-12-13'), billableDays: 3, rentalCost: 4091, wopecareTotalCost: 324, totalCost: 1, amountCharged: 0 } });
    check('a later reduction takes an existing balance back down (never below 0)', r.booking.balance_due === 0, String(r.booking.balance_due));
  }
  {
    // a booking that is not paid yet never gets a balance (they pay the full new total when they pay)
    const b = baseBooking(); b.payment_status = 'unpaid'; b.status = 'pending';
    const r = await runModify({ booking: b, callerId: 'A', body: { ...dates('2026-12-10', '2026-12-17'), billableDays: 7, rentalCost: 9545, wopecareTotalCost: 756, totalCost: 1, amountCharged: 0 } });
    check('an unpaid booking never gets a balance due', r.status === 200 && !(r.booking.balance_due > 0), JSON.stringify([r.status, r.booking.balance_due]));
  }

  // ============================== confirm-balance-payment ==============================
  console.log('--- confirm-balance-payment ---');
  async function runBalance({ balance = 300, callerId = 'R', body, tx = null, payments = [], mods }) {
    const tables = {
      users: [{ id: 'R', role: 'renter', email: 'r@example.com' }, { id: 'A', role: 'admin', email: 'a@example.com' }, { id: 'X', role: 'renter', email: 'x@example.com' }],
      bookings: [{ id: 'B1', booking_ref: 'WC-T-9', renter_id: 'R', payment_status: 'paid', payment_ref: 'ps_main', total_cost: 3300, balance_due: balance }],
      booking_balance_payments: payments, internal_secrets: [], notifications: [],
      booking_modifications: mods ?? [{ id: 'M1', booking_id: 'B1', old_total_cost: 3000, amount_charged: 0, payment_ref: null, created_at: '2026-10-20' }],
    };
    const { client, log } = makeDb(tables);
    const fetchStub = async (url) => ({ ok: true, json: async () => (String(url).includes('/transaction/verify/') ? tx ?? { status: false, message: 'Transaction reference not found' } : {}) });
    const handler = loadFunction('confirm-balance-payment/index.ts', { createClient: (u, k, o) => client(o?.global ? callerId : null), env: { SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's', PAYSTACK_SECRET_KEY: 'k' }, fetch: fetchStub });
    const res = await handler(req({ bookingId: 'B1', ...body }));
    return { status: res.status, body: await res.json(), tables, log };
  }
  const goodTx = (over = {}) => ({ status: true, data: { status: 'success', amount: 30000, currency: 'GHS', reference: 'ps_bal', customer: { email: 'r@example.com' }, metadata: { booking_ids: ['B1'], user_id: 'R', purpose: 'balance' }, ...over } });
  {
    const r = await runBalance({ body: { reference: 'ps_bal' }, tx: goodTx() });
    check('a Paystack payment of the balance clears it', r.status === 200 && r.body.status === 'applied' && r.tables.bookings[0].balance_due === 0, JSON.stringify([r.status, r.body, r.tables.bookings[0].balance_due]));
    check('the payment is recorded and booked onto the modification (so a cancel refunds against what was paid)', r.tables.booking_balance_payments.length === 1 && r.tables.booking_modifications[0].amount_charged === 300 && r.tables.booking_modifications[0].payment_ref === 'ps_bal', JSON.stringify([r.tables.booking_balance_payments, r.tables.booking_modifications]));
    check('QuickBooks is told about the payment', r.log.invokes.some((i) => i.name === 'quickbooks-record-balance-payment'));
  }
  {
    const r = await runBalance({ balance: 0, body: { reference: 'ps_bal' }, tx: goodTx(), payments: [{ id: 'P0', booking_id: 'B1', amount: 300, reference: 'ps_bal' }] });
    check('confirming the same payment twice changes nothing (idempotent)', r.status === 200 && r.body.status === 'already_applied' && r.tables.booking_balance_payments.length === 1, JSON.stringify([r.status, r.body]));
  }
  { const r = await runBalance({ body: { reference: 'ps_bal' }, tx: goodTx({ metadata: { booking_ids: ['B1'], user_id: 'R' } }) }); check('a payment not started as a balance payment is rejected (403)', r.status === 403 && r.tables.bookings[0].balance_due === 300, JSON.stringify([r.status, r.body])); }
  { const r = await runBalance({ body: { reference: 'ps_main' }, tx: goodTx({ reference: 'ps_main' }) }); check('the booking’s own original payment reference can not be replayed as a balance payment (409)', r.status === 409, JSON.stringify([r.status, r.body])); }
  { const r = await runBalance({ callerId: 'X', body: { reference: 'ps_bal' }, tx: goodTx() }); check('another account cannot clear someone else’s balance (403)', r.status === 403 && r.tables.bookings[0].balance_due === 300, JSON.stringify([r.status, r.body])); }
  { const r = await runBalance({ body: { reference: 'ps_bal' }, tx: goodTx({ status: 'failed' }) }); check('a failed Paystack payment does not clear anything', r.body.status === 'not_paid' && r.tables.bookings[0].balance_due === 300, JSON.stringify([r.status, r.body])); }
  { const r = await runBalance({ body: { reference: 'ps_bal' }, tx: goodTx({ amount: 12000 }) }); check('a part payment through Paystack leaves the rest due (60%)', r.status === 200 && r.tables.bookings[0].balance_due === 180, JSON.stringify([r.status, r.body, r.tables.bookings[0].balance_due])); }
  {
    const r = await runBalance({ callerId: 'A', body: { manual: true, amount: 100, note: 'cash at office' } });
    check('staff can record money collected outside the app (partial)', r.status === 200 && r.body.balanceAfter === 200 && r.tables.booking_balance_payments[0].method === 'manual', JSON.stringify([r.status, r.body]));
    const r2 = await runBalance({ callerId: 'A', body: { manual: true, amount: 500 } });
    check('staff cannot record more than the balance owed (400)', r2.status === 400 && r2.tables.bookings[0].balance_due === 300, JSON.stringify([r2.status, r2.body]));
    const r3 = await runBalance({ callerId: 'R', body: { manual: true, amount: 100 } });
    check('a renter cannot record a manual payment for themselves (403)', r3.status === 403 && r3.tables.bookings[0].balance_due === 300, JSON.stringify([r3.status, r3.body]));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
