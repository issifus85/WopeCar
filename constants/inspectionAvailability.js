// When an inspection may be started, shared by the places that offer it so they cannot drift apart. The renter and vendor screens
// already lock the post-rental inspection until the pre-rental one is submitted; the admin booking details offered both at once.
//
// bookingStatus is the DB value ('pending' | 'confirmed' | 'completed' | 'cancelled'); case does not matter.
// preStatus is the pre-rental inspection's status ('draft' | 'submitted' | null/undefined when not started).
export function inspectionAvailability({ type, bookingStatus, preStatus }) {
  const status = String(bookingStatus || '').toLowerCase();
  if (status === 'cancelled') return { available: false, reason: 'Booking cancelled' };
  if (status !== 'confirmed' && status !== 'completed') return { available: false, reason: 'Available once the booking is confirmed' };
  if (type === 'post' && preStatus !== 'submitted') return { available: false, reason: 'Locked - submit the pre-rental inspection first' };
  return { available: true, reason: null };
}
