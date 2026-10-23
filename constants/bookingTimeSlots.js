// Pickup/return time windows by booking rule set. Shared by the booking flow (checkout/dates.js) and Modify Booking so they cannot drift.
//
// Self-drive handovers run 9:00 AM to 5:00 PM (was 8-6; changed Oct 2026).
export const SELF_DRIVE_SLOTS = [
  '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
];

// Chauffeur bookings keep the original 8:00 AM-6:00 PM base window - the self-drive cut-down above must NOT narrow them, so they build on
// their own list rather than on SELF_DRIVE_SLOTS. A self-drive car booked WITH a driver follows the chauffeur rules, so it uses these too.
const CHAUFFEUR_BASE_SLOTS = [
  '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM',
];

// A driver can start earlier and finish later than a self-drive handover requires.
export const CHAUFFEUR_PICKUP_SLOTS = ['5:30 AM', '6:00 AM', '7:00 AM', ...CHAUFFEUR_BASE_SLOTS];
export const CHAUFFEUR_RETURN_SLOTS = [...CHAUFFEUR_BASE_SLOTS, '7:00 PM', '8:00 PM', '8:30 PM'];
