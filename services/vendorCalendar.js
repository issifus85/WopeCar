// Shared date-grid primitives for Vendor Mode's two calendar screens - the
// per-car editable Availability Calendar (app/vendor/car/availability/[id].js)
// and the read-only aggregate fleet Calendar tab
// (app/vendor/(tabs)/calendar.js) - so their day-state logic can't drift
// apart. Mirrors components/DateRangeModal.js's own month-grid pattern.

export const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function toISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addDays(date, count) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
}

export function buildMonthGrid(viewMonth) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstDay.getDay();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  return cells;
}

// Sundays are auto-blocked for self-drive/mixed cars (business is closed to
// self-drive pickup that day - there's no staff to hand over keys). A
// chauffeur-only car ships its own driver, so Sunday is open for those,
// except within 24h of the pickup date itself (same-day Sunday chauffeur
// pickups aren't allowed - see app/checkout/dates.js's matching renter-side
// rule, which this must stay in sync with).
export function isSundayBlockedForCar(day, car, today) {
  if (day.getDay() !== 0) return false;
  if (car?.drivenBy !== 'Chauffeur') return true;

  const tomorrow = addDays(stripTime(today), 1);
  return stripTime(day) < tomorrow;
}

// Past dates (with nothing booked) have nothing left to manage - neither
// blocked Sundays nor past days are part of the vendor's own blockedDates
// list, both are simply not tappable/actionable. A real booking always wins
// over "past", though, so the read-only fleet Calendar tab can show
// accurate history rather than hiding it behind a generic "past" grey -
// both states are equally non-interactive either way, so this only affects
// color, not behavior.
export function getDayState(day, { today, bookedRanges, blockedSet, car }) {
  if (isSundayBlockedForCar(day, car, today)) return 'sunday';
  if (bookedRanges.some((r) => day >= r.start && day <= r.end)) return 'booked';
  if (day < today) return 'past';
  if (blockedSet.has(toISODate(day))) return 'blocked';
  return 'available';
}

// Booked ranges for one car, derived from bookingHistory the same way both
// calendar screens need it - only Confirmed/Completed bookings occupy the
// calendar (a Requested booking hasn't been accepted yet).
export function bookedRangesForCar(bookingHistory, carId) {
  return bookingHistory
    .filter((b) => b.carId === carId && (b.status === 'Confirmed' || b.status === 'Completed'))
    .map((b) => ({ start: stripTime(new Date(b.startDate)), end: stripTime(new Date(b.endDate)) }));
}
