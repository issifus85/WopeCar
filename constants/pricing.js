import { useEffect, useState } from 'react';
import { COLORS } from './theme';

export const CURRENCY_CODE = 'GHS';

// Matches the old hardcoded "GHS 1,234" output when no active currency is
// passed in (e.g. a call site not yet wired to CurrencyContext, or the
// context still loading).
const DEFAULT_CURRENCY = {
  symbol: 'GH₵',
  rate: 1,
  format: 'left',
  decimals: 0,
  thousandSeparator: ',',
  decimalSeparator: '.',
};

// Builds the number string using the admin's configured separators
// (e.g. EUR on this backend is "." thousands / "," decimals - European
// style) instead of assuming en-US comma/dot, which toLocaleString('en-US')
// would silently force regardless of what the admin actually configured.
function formatNumber(value, decimals, thousandSeparator, decimalSeparator) {
  const isNegative = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSeparator ?? '');
  return (isNegative ? '-' : '') + withThousands + (decPart ? (decimalSeparator ?? '.') + decPart : '');
}

// `amount` is always in the base currency (GHS, what the backend stores).
// `currency` (from useCurrency()'s activeCurrency) carries the admin-
// configured rate to convert into and how to format the result - rate is
// GHS-per-unit-of-that-currency (see App\Currency::format() on the
// backend), so dividing converts a GHS amount into that currency.
export function formatCurrency(amount, currency = DEFAULT_CURRENCY) {
  const value = (Number(amount) || 0) / (currency.rate || 1);
  const decimals = currency.decimals ?? 0;
  const s = formatNumber(value, decimals, currency.thousandSeparator, currency.decimalSeparator);

  switch (currency.format) {
    case 'right_space':
      return `${s} ${currency.symbol}`;
    case 'left':
      return `${currency.symbol}${s}`;
    case 'left_space':
      return `${currency.symbol} ${s}`;
    default:
      return `${s}${currency.symbol}`;
  }
}

// Matches the live site's booking widget and T&Cs (wopecar.com/book-a-car/<slug>):
// a flat delivery/collection fee for self-drive rentals only, plus a refundable
// security deposit (all rentals) of 25% of the rental+add-ons subtotal, or a
// flat GHS 500 if that subtotal is under GHS 2,000.
//
// This is also the fallback default for getSelfDriveDeliveryFee() below -
// kept as a real export (not inlined) so callers that genuinely can't await
// (e.g. a synchronous render) still have a sane value.
export const SELF_DRIVE_DELIVERY_FEE = 200;

// Admin-configured app_settings rows are cached client-side (below) so
// synchronous price computations never have to await a fetch - but a cache
// that only ever fetches once per app process (the original shape of every
// getter in this file) means an admin edit is invisible to any session
// already running, indefinitely, not just briefly. Re-checking on a short
// TTL instead means an edit shows up the next time anyone re-opens pricing
// within a minute, without turning every price read into a network call.
const SETTINGS_CACHE_TTL_MS = 60 * 1000;

// Admin > Settings > Business Rules > "Self-Drive Delivery Fee" is real and
// live-editable (app_settings.self_drive_delivery_fee), not just stored -
// this is the read side. Stale-while-revalidate: every call returns
// whatever's cached *right now* (the hardcoded constant until the first
// fetch resolves) and kicks off a background fetch, at most once per
// SETTINGS_CACHE_TTL_MS, to replace it with the real configured value.
// Avoids forcing every synchronous price computation in the app to become
// async just to read one admin-configurable number.
let cachedSelfDriveDeliveryFee = SELF_DRIVE_DELIVERY_FEE;
let selfDriveDeliveryFeeFetchedAt = 0;

export function getSelfDriveDeliveryFee() {
  if (Date.now() - selfDriveDeliveryFeeFetchedAt > SETTINGS_CACHE_TTL_MS) {
    selfDriveDeliveryFeeFetchedAt = Date.now();
    // Lazy import avoids a module-load-order/circular-import risk with
    // services/supabase.js pulling in constants at startup.
    import('../services/supabase')
      .then(({ getAppSetting }) => getAppSetting('self_drive_delivery_fee'))
      .then((value) => {
        if (typeof value === 'number' && value >= 0) cachedSelfDriveDeliveryFee = value;
      })
      .catch(() => {
        // Keep the last-known-good value - never let a settings-fetch
        // failure block checkout.
      });
  }
  return cachedSelfDriveDeliveryFee;
}

// Admin > Settings > Business Rules > "Latest Badge Window" - how many days
// after a car is added it still shows the "New" badge and gets prioritized
// by the Home screen's "Latest" sort. Same stale-while-revalidate pattern as
// getSelfDriveDeliveryFee() above - see that function's comment.
export const LATEST_BADGE_DAYS = 14;

let cachedLatestBadgeDays = LATEST_BADGE_DAYS;
let latestBadgeDaysFetchedAt = 0;

export function getLatestBadgeDays() {
  if (Date.now() - latestBadgeDaysFetchedAt > SETTINGS_CACHE_TTL_MS) {
    latestBadgeDaysFetchedAt = Date.now();
    import('../services/supabase')
      .then(({ getAppSetting }) => getAppSetting('latest_badge_days'))
      .then((value) => {
        if (typeof value === 'number' && value >= 0) cachedLatestBadgeDays = value;
      })
      .catch(() => {
        // Keep the last-known-good value - never let a settings-fetch
        // failure hide/show the badge incorrectly.
      });
  }
  return cachedLatestBadgeDays;
}

// Admin > Settings > Discounts > "App-Wide Discount" - a site-wide
// promotional discount, distinct from a car's own discount_enabled/type/
// value/dates. Only applies to a car that does NOT already have its own
// active discount (see calculateRentalPricing / isAnyDiscountActive /
// applyAnyDiscount below - a car's own discount always wins). Stored as 5
// separate app_settings rows rather than one jsonb object (matches every
// other setting's flat shape), assembled here into the same {enabled, type,
// value, startsAt, endsAt} shape a car's own `discount` already uses, so
// the exact same discountAmount()/window-check logic works for both. Same
// stale-while-revalidate pattern as getSelfDriveDeliveryFee() above.
const DEFAULT_APP_WIDE_DISCOUNT = { enabled: false, type: 'percentage', value: null, startsAt: null, endsAt: null };

let cachedAppWideDiscount = DEFAULT_APP_WIDE_DISCOUNT;
let appWideDiscountFetchedAt = 0;

// Unlike getSelfDriveDeliveryFee()/getLatestBadgeDays() (read once, well
// before the value matters, deep into checkout), this is read on the very
// first paint of the Home screen's car cards - nothing else guarantees a
// re-render once the background fetch resolves, which without this would
// mean a freshly-enabled promo silently not appearing until some unrelated
// state change (e.g. tapping a filter) happened to re-render the cards.
// Listeners let useAppWideDiscount() (below) force that re-render itself.
const appWideDiscountListeners = new Set();

export function subscribeAppWideDiscount(listener) {
  appWideDiscountListeners.add(listener);
  return () => appWideDiscountListeners.delete(listener);
}

// Reactive counterpart to getAppWideDiscount() - re-renders the calling
// component once the background fetch resolves, instead of silently
// keeping whatever value was cached at the component's first render.
export function useAppWideDiscount() {
  const [discount, setDiscount] = useState(getAppWideDiscount());
  useEffect(() => subscribeAppWideDiscount(setDiscount), []);
  return discount;
}

export function getAppWideDiscount() {
  if (Date.now() - appWideDiscountFetchedAt > SETTINGS_CACHE_TTL_MS) {
    appWideDiscountFetchedAt = Date.now();
    import('../services/supabase')
      .then(({ getAppSetting }) =>
        Promise.all([
          getAppSetting('app_wide_discount_enabled'),
          getAppSetting('app_wide_discount_type'),
          getAppSetting('app_wide_discount_value'),
          getAppSetting('app_wide_discount_starts_at'),
          getAppSetting('app_wide_discount_ends_at'),
        ])
      )
      .then(([enabled, type, value, startsAt, endsAt]) => {
        cachedAppWideDiscount = {
          enabled: !!enabled,
          type: type === 'flat' ? 'flat' : 'percentage',
          value: typeof value === 'number' ? value : null,
          startsAt: startsAt ?? null,
          endsAt: endsAt ?? null,
        };
        appWideDiscountListeners.forEach((listener) => listener(cachedAppWideDiscount));
      })
      .catch(() => {
        // Keep the disabled default - never let a settings-fetch failure
        // surface a discount that isn't actually configured.
      });
  }
  return cachedAppWideDiscount;
}

// True if `createdAt` (a car's created_at) is still within the configured
// "New" badge window - shared by CarListCard/CarTileCard's badge and
// nothing else, so it lives here next to the setting it reads.
export function isCarNew(createdAt) {
  if (!createdAt) return false;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs >= 0 && ageMs <= getLatestBadgeDays() * 24 * 60 * 60 * 1000;
}

const SECURITY_DEPOSIT_THRESHOLD = 2000;
const SECURITY_DEPOSIT_FLAT = 500;
const SECURITY_DEPOSIT_PERCENT = 0.25;

// Generic stale-while-revalidate getter factory - same shape as
// getSelfDriveDeliveryFee() above, just parameterized so the three self-drive
// deposit knobs below (and getChauffeurSecurityDeposit()) don't each need
// their own copy-pasted cache/fetch boilerplate.
function makeSettingGetter(key, defaultValue) {
  let cached = defaultValue;
  let fetchedAt = 0;
  return function getSetting() {
    if (Date.now() - fetchedAt > SETTINGS_CACHE_TTL_MS) {
      fetchedAt = Date.now();
      import('../services/supabase')
        .then(({ getAppSetting }) => getAppSetting(key))
        .then((value) => {
          if (typeof value === 'number' && value >= 0) cached = value;
        })
        .catch(() => {
          // Keep the last-known-good value - never let a settings-fetch
          // failure block checkout.
        });
    }
    return cached;
  };
}

// Admin > Settings > Business Rules > "Chauffeur Security Deposit" - real and
// live-editable (app_settings.chauffeur_security_deposit). Unlike self-drive
// (25% of subtotal, or a flat amount below the threshold - see the three
// getters below), a chauffeured booking always takes this one flat amount
// regardless of trip cost - there's no vehicle handed over unsupervised, so
// the deposit only needs to cover minor incidental costs, not damage risk.
export const CHAUFFEUR_SECURITY_DEPOSIT = 500;
export const getChauffeurSecurityDeposit = makeSettingGetter('chauffeur_security_deposit', CHAUFFEUR_SECURITY_DEPOSIT);

// Admin > Settings > Business Rules > "Security Deposit — Flat/Threshold/
// Percentage" - the self-drive deposit formula's three knobs, each real and
// live-editable (app_settings.security_deposit_flat/_threshold/_percentage).
// These three fields already existed in both admin UIs but weren't actually
// wired to anything - calculateSecurityDeposit() below used to read only the
// hardcoded consts above. Every self-drive checkout now reads live.
export const getSecurityDepositFlat = makeSettingGetter('security_deposit_flat', SECURITY_DEPOSIT_FLAT);
export const getSecurityDepositThreshold = makeSettingGetter('security_deposit_threshold', SECURITY_DEPOSIT_THRESHOLD);
export const getSecurityDepositPercentage = makeSettingGetter('security_deposit_percentage', SECURITY_DEPOSIT_PERCENT);

export function calculateSecurityDeposit(subtotal, drivenBy) {
  if (drivenBy === 'Chauffeur') return getChauffeurSecurityDeposit();
  return subtotal < getSecurityDepositThreshold() ? getSecurityDepositFlat() : subtotal * getSecurityDepositPercentage();
}

// Minimum rental length, per wopecar.com/faq: chauffeured trips can be
// booked for a single day, but self-drive requires a 3-day minimum since
// the vehicle is handed over unsupervised for the whole rental.
// Admin > Settings > Business Rules exposes both as
// app_settings.min_booking_days_self_drive/_chauffeur, but nothing ever read
// them - these two fields did nothing no matter what an admin set them to.
// Wired to the same live-editable pattern as every other setting above.
export const MIN_BOOKING_DAYS_SELF_DRIVE = 3;
export const MIN_BOOKING_DAYS_CHAUFFEUR = 1;

export const getMinBookingDaysSelfDrive = makeSettingGetter('min_booking_days_self_drive', MIN_BOOKING_DAYS_SELF_DRIVE);
export const getMinBookingDaysChauffeur = makeSettingGetter('min_booking_days_chauffeur', MIN_BOOKING_DAYS_CHAUFFEUR);

export function getMinBookingDays(drivenBy) {
  return drivenBy === 'Self-drive' ? getMinBookingDaysSelfDrive() : getMinBookingDaysChauffeur();
}

// --- Rental Cost & Duration Calculation Engine ------------------------------
// Billable days are driven by actual elapsed time between pickup and return
// (date + time-of-day), not a naive calendar-day difference, because the two
// driven modes bill on different cycle lengths:
//   - Self-drive: 24-hour cycle. Any duration up to 24h is 1 billable day;
//     each additional 24h (or part thereof) is another day.
//   - Chauffeur: 12-hour cycle. Any duration up to 12h is 1 billable day
//     (e.g. 8:00 AM-8:00 PM); each additional 12h (or part thereof) is
//     another day.
// A configurable grace period (default 29 minutes) only applies to the
// self-drive cycle, absorbing minor lateness at each 24h boundary so a
// return that's a few minutes over doesn't silently trigger a full extra
// day's charge. Chauffeur bookings have no grace period per the spec.
const MINUTES_PER_HOUR = 60;
export const SELF_DRIVE_CYCLE_HOURS = 24;
export const CHAUFFEUR_CYCLE_HOURS = 12;
export const DEFAULT_GRACE_PERIOD_MINUTES = 29;

const TIME_SLOT_PATTERN = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// A bare 'YYYY-MM-DD' string parses as UTC midnight in JS, which shifts to
// the previous calendar day in any timezone behind UTC (e.g. renders Aug 1
// as Jul 31 in America/New_York) - every other date shape here (a Date
// object, or a full datetime string) already carries real local time and
// doesn't have this problem. Only date-only strings need the special case:
// split the literal Y/M/D and construct the Date from local components.
function parseDateOnly(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Combines a date-only value (Date, ISO date string, or datetime string)
// with a 12-hour time-slot string (e.g. "8:00 AM", as produced by
// checkout's TimeSlotPicker) into a single Date. Falls back to the date's
// own time component if no time string is given.
function combineDateAndTime(date, time) {
  const base = typeof date === 'string' && DATE_ONLY_PATTERN.test(date) ? parseDateOnly(date) : new Date(date);
  const match = time ? TIME_SLOT_PATTERN.exec(String(time).trim()) : null;
  if (!match) return base;
  const [, hourStr, minuteStr, meridiem] = match;
  let hour = parseInt(hourStr, 10) % 12;
  if (meridiem.toUpperCase() === 'PM') hour += 12;
  const combined = new Date(base);
  combined.setHours(hour, parseInt(minuteStr, 10), 0, 0);
  return combined;
}

// Picks the richest length-of-stay tier the trip qualifies for (highest
// minDays that's still <= billableDays) - tiers don't stack, matching
// Airbnb's own weekly/monthly discount behavior (a 30-night stay gets the
// monthly rate, not weekly-on-top-of-monthly).
function pickLengthOfStayTier(tiers, billableDays) {
  if (!tiers?.length) return null;
  const eligible = tiers.filter((t) => t?.minDays > 0 && billableDays >= t.minDays);
  if (!eligible.length) return null;
  return eligible.reduce((best, t) => (t.minDays > best.minDays ? t : best));
}

function discountAmount(base, discount) {
  if (!discount || !(discount.value > 0)) return 0;
  const amount = discount.type === 'percentage' ? base * (discount.value / 100) : discount.value;
  return Math.min(base, Math.max(0, amount));
}

// Same enabled + active-window check calculateRentalPricing() uses for the
// blanket discount, exposed for screens that want to show a strikethrough
// price before a trip's actual pickup date is known (e.g. the car listing/
// detail pages) - checked against `date` (defaults to today) instead of a
// booking's pickup date.
export function isBlanketDiscountActive(discount, date = new Date()) {
  if (!discount?.enabled || !(discount.value > 0)) return false;
  const dateOnly = stripTimeToDateOnly(date);
  const startsAt = discount.startsAt ? parseDateOnly(discount.startsAt) : null;
  const endsAt = discount.endsAt ? parseDateOnly(discount.endsAt) : null;
  return (!startsAt || dateOnly >= startsAt) && (!endsAt || dateOnly <= endsAt);
}

// The discounted per-day price for display when isBlanketDiscountActive() is
// true - e.g. the base pricePerDay shown (with strikethrough) on a listing
// before any specific dates are picked.
export function applyBlanketDiscount(base, discount) {
  return base - discountAmount(base, discount);
}

// Same "a car's own discount wins" rule calculateRentalPricing() applies -
// true if EITHER the car's own discount or the app-wide discount is active,
// checking the car's own first. Lets listing/detail screens show the same
// strikethrough price they'd actually get at checkout without duplicating
// the fallback logic themselves.
export function isAnyDiscountActive(discount, appWideDiscount = getAppWideDiscount(), date = new Date()) {
  return isBlanketDiscountActive(discount, date) || isBlanketDiscountActive(appWideDiscount, date);
}

// Discounted price using whichever discount isAnyDiscountActive() picked -
// the car's own if active, else the app-wide one, else `base` unchanged.
export function applyAnyDiscount(base, discount, appWideDiscount = getAppWideDiscount(), date = new Date()) {
  if (isBlanketDiscountActive(discount, date)) return applyBlanketDiscount(base, discount);
  if (isBlanketDiscountActive(appWideDiscount, date)) return applyBlanketDiscount(base, appWideDiscount);
  return base;
}

function stripTimeToDateOnly(date) {
  const d = typeof date === 'string' && DATE_ONLY_PATTERN.test(date) ? parseDateOnly(date) : new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Calculates billable rental days and cost from pickup/return date + time,
// applying the correct billing cycle for the driven mode, then layers on
// per-date custom pricing and discounts:
//   - getDatePrice(isoDate) - optional lookup for a vendor/admin-set custom
//     price on a specific calendar date; falls back to `dailyRate` for any
//     date it returns nothing for. Each billable day is priced against the
//     calendar date it actually falls on (startDate + i days), not a flat
//     per-booking rate, so a rental spanning a priced "surge" date and a
//     normal date bills each day correctly.
//   - lengthOfStayDiscounts - optional [{minDays, type, value}] tiers (like
//     Airbnb's weekly/monthly discount), applied to the summed rental cost
//     before the blanket discount.
//   - discount - optional {enabled, type, value, startsAt, endsAt} blanket
//     promotional discount, applied after the length-of-stay discount and
//     only when enabled and the pickup date falls inside its window (an
//     unset startsAt/endsAt means no bound on that side).
//   - appWideDiscount - the admin-only, site-wide discount (same shape as
//     `discount`, read live via getAppWideDiscount() unless overridden).
//     Only applied when the car's own `discount` is NOT active for this
//     pickup date - a car's own discount always takes priority, so this
//     never stacks on top of or overrides a vendor/admin's per-car choice.
export function calculateRentalPricing({
  startDate,
  endDate,
  pickupTime,
  returnTime,
  drivenBy,
  dailyRate = 0,
  useGracePeriod = true,
  gracePeriodMinutes = DEFAULT_GRACE_PERIOD_MINUTES,
  getDatePrice,
  lengthOfStayDiscounts,
  discount,
  appWideDiscount = getAppWideDiscount(),
}) {
  const pickupAt = combineDateAndTime(startDate, pickupTime);
  const returnAt = combineDateAndTime(endDate, returnTime);
  const durationMinutes = Math.max(0, Math.round((returnAt - pickupAt) / (1000 * 60)));

  const isChauffeur = drivenBy === 'Chauffeur';
  const cycleHours = isChauffeur ? CHAUFFEUR_CYCLE_HOURS : SELF_DRIVE_CYCLE_HOURS;
  const cycleMinutes = cycleHours * MINUTES_PER_HOUR;
  const graceMinutes = !isChauffeur && useGracePeriod ? gracePeriodMinutes : 0;

  const billableDays = Math.max(1, Math.ceil((durationMinutes - graceMinutes) / cycleMinutes));

  const pickupDateOnly = new Date(pickupAt.getFullYear(), pickupAt.getMonth(), pickupAt.getDate());
  const dailyBreakdown = [];
  let baseRentalCost = 0;
  for (let i = 0; i < billableDays; i++) {
    const date = new Date(pickupDateOnly.getFullYear(), pickupDateOnly.getMonth(), pickupDateOnly.getDate() + i);
    const iso = toISODate(date);
    const rate = getDatePrice?.(iso) ?? dailyRate;
    dailyBreakdown.push({ date: iso, rate });
    baseRentalCost += rate;
  }

  const appliedLengthOfStayTier = pickLengthOfStayTier(lengthOfStayDiscounts, billableDays);
  const lengthOfStayDiscountAmount = appliedLengthOfStayTier
    ? discountAmount(baseRentalCost, appliedLengthOfStayTier)
    : 0;
  const afterLengthOfStay = baseRentalCost - lengthOfStayDiscountAmount;

  const isDiscountActiveOn = (d) => {
    if (!d?.enabled) return false;
    const startsAt = d.startsAt ? parseDateOnly(d.startsAt) : null;
    const endsAt = d.endsAt ? parseDateOnly(d.endsAt) : null;
    return (!startsAt || pickupDateOnly >= startsAt) && (!endsAt || pickupDateOnly <= endsAt);
  };

  let blanketDiscountAmount = 0;
  let appliedDiscountSource = null;
  if (isDiscountActiveOn(discount)) {
    blanketDiscountAmount = discountAmount(afterLengthOfStay, discount);
    appliedDiscountSource = 'car';
  } else if (isDiscountActiveOn(appWideDiscount)) {
    blanketDiscountAmount = discountAmount(afterLengthOfStay, appWideDiscount);
    appliedDiscountSource = 'app_wide';
  }

  const rentalCost = afterLengthOfStay - blanketDiscountAmount;

  return {
    pickupAt,
    returnAt,
    durationMinutes,
    durationHours: durationMinutes / MINUTES_PER_HOUR,
    cycleHours,
    billableDays,
    dailyRate,
    dailyBreakdown,
    baseRentalCost,
    appliedLengthOfStayTier,
    lengthOfStayDiscountAmount,
    blanketDiscountAmount,
    appliedDiscountSource,
    totalDiscount: lengthOfStayDiscountAmount + blanketDiscountAmount,
    rentalCost,
  };
}

// --- WopeCare (damage protection add-on) -------------------------------
// WopeCare is a WopeCar-direct damage protection benefit offered at
// checkout - explicitly NOT insurance. Rate is a percentage of the car's
// own pricePerDay, charged per billable day; `coverage` is the maximum
// eligible incidental-damage amount that plan protects against, not a
// price. Colors reference the same brand-fixed COLORS every plan badge
// elsewhere in the app already uses, rather than re-hardcoding hex here.
export const WOPECARE_PLANS = {
  none: {
    id: 'none',
    name: 'No Protection',
    rate: 0,
    coverage: 0,
    description: 'You remain responsible for all damage costs',
  },
  basic: {
    id: 'basic',
    name: 'WopeCare Basic',
    label: 'Essential Protection',
    rate: 0.08,
    coverage: 1500,
    color: COLORS.teal,
    features: [
      'Scratches & scuffs',
      'Minor dents',
      'Minor bumper & body damage',
    ],
  },
  plus: {
    id: 'plus',
    name: 'WopeCare Plus',
    label: 'Most Popular',
    rate: 0.12,
    coverage: 3000,
    color: COLORS.navy,
    features: [
      'Scratches & scuffs',
      'Minor dents',
      'Minor bumper & body damage',
      'More protection for unexpected damage',
    ],
  },
  premium: {
    id: 'premium',
    name: 'WopeCare Premium',
    label: 'Maximum Protection',
    rate: 0.16,
    coverage: 5000,
    color: COLORS.orange,
    features: [
      'Scratches & scuffs',
      'Minor dents',
      'Minor bumper & body damage',
      'Our highest incidental damage protection',
    ],
  },
};

// Total WopeCare cost for the whole trip - `days` should be the same
// billableDays calculateRentalPricing() already computed for this booking,
// not a naive calendar-day count, so WopeCare bills on the same cycle as
// the rental itself.
export function calculateWopeCareCost(pricePerDay, plan, days) {
  if (plan === 'none' || !plan) return 0;
  const dailyRate = pricePerDay * WOPECARE_PLANS[plan].rate;
  return Math.round(dailyRate * days * 100) / 100;
}

// Per-day WopeCare rate for display (e.g. "GH₵17.40/day") - independent of
// trip length, unlike calculateWopeCareCost() above.
export function calculateWopeCareDailyRate(pricePerDay, plan) {
  if (plan === 'none' || !plan) return 0;
  return Math.round(pricePerDay * WOPECARE_PLANS[plan].rate * 100) / 100;
}

// --- Vendor payout (admin-set, per car, hidden from the vendor entirely) --
// A car's payout_per_day (cars.payout_per_day, admin-only - see
// components/ui/RichTextEditor.tsx's sibling fields in wopecar-admin's
// CarFormModal for where it's set) is what WopeCar commits to pay the
// vendor per rental day, independent of what the renter is charged.
// `days` should be the same billableDays calculateRentalPricing() already
// computed for this booking, matching the WopeCare functions above -
// never a naive calendar-day count.
export function calculateVendorPayout(payoutPerDay, days) {
  if (!payoutPerDay || payoutPerDay <= 0) return 0;
  return Math.round(payoutPerDay * days * 100) / 100;
}

// WopeCar's commission on a booking - the full client total (bookings.
// total_cost: rental + add-ons + delivery fee + security deposit +
// WopeCare) minus what the vendor is paid out. Matches the business rule
// as specified: "WopeCar margin = client total − vendor payout total".
export function calculateWopeCarMargin(clientTotal, vendorPayout) {
  return Math.round((clientTotal - vendorPayout) * 100) / 100;
}
