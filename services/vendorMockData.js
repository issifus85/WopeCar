// Fallback defaults for Vendor Mode - used only while a car's real
// min_booking_days/advance_notice/booking_window columns haven't loaded yet
// (see contexts/VendorContext.js's getAvailabilitySettings), not as an
// override store. Matches wopecar.com's stated self-drive minimum (see
// constants/pricing.js) as the default minimum booking length.
export const DEFAULT_AVAILABILITY_SETTINGS = {
  advanceNoticeDays: 1,
  bookingWindowMonths: 6,
  minBookingDays: 3,
};
