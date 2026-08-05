export const CURRENCY_CODE = 'GHS';

// Matches the old hardcoded "GHS 1,234" output when no active currency is
// passed in (e.g. a call site not yet wired to CurrencyContext, or the
// context still loading).
const DEFAULT_CURRENCY = {
  symbol: CURRENCY_CODE,
  rate: 1,
  format: 'left_space',
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

// Admin > Settings > Business Rules > "Self-Drive Delivery Fee" is real and
// live-editable (app_settings.self_drive_delivery_fee), not just stored -
// this is the read side. Stale-while-revalidate: every call returns
// whatever's cached *right now* (the hardcoded constant until the first
// fetch resolves) and kicks off exactly one background fetch to replace it
// with the real configured value for every call after that. Avoids forcing
// every synchronous price computation in the app to become async just to
// read one admin-configurable number.
let cachedSelfDriveDeliveryFee = SELF_DRIVE_DELIVERY_FEE;
let hasFetchedSelfDriveDeliveryFee = false;

export function getSelfDriveDeliveryFee() {
  if (!hasFetchedSelfDriveDeliveryFee) {
    hasFetchedSelfDriveDeliveryFee = true;
    // Lazy import avoids a module-load-order/circular-import risk with
    // services/supabase.js pulling in constants at startup.
    import('../services/supabase')
      .then(({ getAppSetting }) => getAppSetting('self_drive_delivery_fee'))
      .then((value) => {
        if (typeof value === 'number' && value >= 0) cachedSelfDriveDeliveryFee = value;
      })
      .catch(() => {
        // Keep the hardcoded default - never let a settings-fetch failure
        // block checkout.
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
let hasFetchedLatestBadgeDays = false;

export function getLatestBadgeDays() {
  if (!hasFetchedLatestBadgeDays) {
    hasFetchedLatestBadgeDays = true;
    import('../services/supabase')
      .then(({ getAppSetting }) => getAppSetting('latest_badge_days'))
      .then((value) => {
        if (typeof value === 'number' && value >= 0) cachedLatestBadgeDays = value;
      })
      .catch(() => {
        // Keep the hardcoded default - never let a settings-fetch failure
        // hide/show the badge incorrectly.
      });
  }
  return cachedLatestBadgeDays;
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

export function calculateSecurityDeposit(subtotal) {
  return subtotal < SECURITY_DEPOSIT_THRESHOLD ? SECURITY_DEPOSIT_FLAT : subtotal * SECURITY_DEPOSIT_PERCENT;
}

// Minimum rental length, per wopecar.com/faq: chauffeured trips can be
// booked for a single day, but self-drive requires a 3-day minimum since
// the vehicle is handed over unsupervised for the whole rental.
export const MIN_BOOKING_DAYS_SELF_DRIVE = 3;
export const MIN_BOOKING_DAYS_CHAUFFEUR = 1;

export function getMinBookingDays(drivenBy) {
  return drivenBy === 'Self-drive' ? MIN_BOOKING_DAYS_SELF_DRIVE : MIN_BOOKING_DAYS_CHAUFFEUR;
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

  let blanketDiscountAmount = 0;
  if (discount?.enabled) {
    const startsAt = discount.startsAt ? parseDateOnly(discount.startsAt) : null;
    const endsAt = discount.endsAt ? parseDateOnly(discount.endsAt) : null;
    const withinWindow = (!startsAt || pickupDateOnly >= startsAt) && (!endsAt || pickupDateOnly <= endsAt);
    if (withinWindow) blanketDiscountAmount = discountAmount(afterLengthOfStay, discount);
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
    totalDiscount: lengthOfStayDiscountAmount + blanketDiscountAmount,
    rentalCost,
  };
}
