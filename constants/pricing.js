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
export const SELF_DRIVE_DELIVERY_FEE = 200;
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

// Combines a date-only value (Date or ISO string) with a 12-hour time-slot
// string (e.g. "8:00 AM", as produced by checkout's TimeSlotPicker) into a
// single Date. Falls back to the date's own time component if no time
// string is given.
function combineDateAndTime(date, time) {
  const base = new Date(date);
  const match = time ? TIME_SLOT_PATTERN.exec(String(time).trim()) : null;
  if (!match) return base;
  const [, hourStr, minuteStr, meridiem] = match;
  let hour = parseInt(hourStr, 10) % 12;
  if (meridiem.toUpperCase() === 'PM') hour += 12;
  const combined = new Date(base);
  combined.setHours(hour, parseInt(minuteStr, 10), 0, 0);
  return combined;
}

// Calculates billable rental days and cost from pickup/return date + time,
// applying the correct billing cycle for the driven mode. dailyRate is the
// per-billable-day price (car.pricePerDay for self-drive, the base chauffeur
// daily fee for chauffeur-driven rentals).
export function calculateRentalPricing({
  startDate,
  endDate,
  pickupTime,
  returnTime,
  drivenBy,
  dailyRate = 0,
  useGracePeriod = true,
  gracePeriodMinutes = DEFAULT_GRACE_PERIOD_MINUTES,
}) {
  const pickupAt = combineDateAndTime(startDate, pickupTime);
  const returnAt = combineDateAndTime(endDate, returnTime);
  const durationMinutes = Math.max(0, Math.round((returnAt - pickupAt) / (1000 * 60)));

  const isChauffeur = drivenBy === 'Chauffeur';
  const cycleHours = isChauffeur ? CHAUFFEUR_CYCLE_HOURS : SELF_DRIVE_CYCLE_HOURS;
  const cycleMinutes = cycleHours * MINUTES_PER_HOUR;
  const graceMinutes = !isChauffeur && useGracePeriod ? gracePeriodMinutes : 0;

  const billableDays = Math.max(1, Math.ceil((durationMinutes - graceMinutes) / cycleMinutes));
  const rentalCost = billableDays * dailyRate;

  return {
    pickupAt,
    returnAt,
    durationMinutes,
    durationHours: durationMinutes / MINUTES_PER_HOUR,
    cycleHours,
    billableDays,
    dailyRate,
    rentalCost,
  };
}
