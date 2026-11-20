import Constants from 'expo-constants';

// Fleet Officer (drivers who deliver and collect cars) is being built and tested on PREPROD only. Production builds and production
// OTA updates must never show it until the release gate in the Fleet Officer spec passes - the production database has none of its
// tables yet. Same pattern as the WopeDriver gate.
export const FLEET_OFFICER_ENABLED = Constants.expoConfig?.extra?.APP_ENV !== 'production';

// Trip task statuses (migration 0179/0180) as the officer and admin screens show them.
export const TRIP_STATUS_LABELS = {
  unassigned: 'Needs officer',
  assigned: 'Assigned',
  accepted: 'Accepted',
  en_route: 'En route',
  arrived: 'Arrived',
  inspecting: 'Inspecting',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const TRIP_STATUS_TONES = {
  unassigned: 'error',
  assigned: 'warning',
  accepted: 'neutral',
  en_route: 'neutral',
  arrived: 'success',
  inspecting: 'success',
  completed: 'muted',
  cancelled: 'muted',
};

/** "Delivery" / "Collection" for a rental; "Chauffeur start" / "Chauffeur end" when the officer drives the renter. */
export function tripTypeLabel(type, driveType) {
  const chauffeur = driveType === 'Chauffeur' || driveType === 'WopeDriver';
  if (type === 'delivery') return chauffeur ? 'Chauffeur start' : 'Delivery';
  return chauffeur ? 'Chauffeur end' : 'Collection';
}

export function formatTripTime(iso) {
  if (!iso) return 'Time to be confirmed';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Accra' });
}
