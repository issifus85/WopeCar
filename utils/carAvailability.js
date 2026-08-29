import { formatDateShort } from '../components/DateRangeModal';

/**
 * Card/detail availability badge text, derived from services/carsApi.js's
 * isAvailableToday/availableFrom (set by getAvailabilityInfo - mirrors
 * wopecar-website's lib/data/cars.ts getAvailabilityInfo() exactly, same
 * RPC, same 90-day scan, so a car reads the same status on both platforms).
 * `shortLabel` is for card badges ("From Aug 30", matching the website's
 * card copy "From 30 Aug"), `longLabel` is for the fuller detail-screen
 * phrasing ("Available from Aug 30"). Falls back to the older, coarser
 * `car.isAvailable` (cars.status === 'active') when isAvailableToday isn't
 * present on this car object yet, so nothing crashes or shows blank.
 */
export function getAvailabilityBadge(car) {
  if (car.isAvailableToday === false) {
    if (car.availableFrom) {
      const dateLabel = formatDateShort(new Date(`${car.availableFrom}T00:00:00`));
      return { isAvailable: false, shortLabel: `From ${dateLabel}`, longLabel: `Available from ${dateLabel}` };
    }
    return { isAvailable: false, shortLabel: 'Booked', longLabel: 'Booked' };
  }
  if (car.isAvailableToday === true) {
    return { isAvailable: true, shortLabel: 'Available', longLabel: 'Available' };
  }
  const fallback = car.isAvailable ? 'Available' : 'Unavailable';
  return { isAvailable: !!car.isAvailable, shortLabel: fallback, longLabel: fallback };
}
