import supabase from './supabase';

// Fleet Officer Phase 4 (migration 0182 + Edge Function fleet-trip-eta): live location and ETA while an officer is on the way.

/** Officer: send one location fix. Returns { sharing, etaDue } - sharing false means the trip is no longer En route or was stopped. */
export async function shareLocation(taskId, { latitude, longitude, heading = null, speed = null, accuracy = null }) {
  const { data, error } = await supabase.rpc('officer_share_location', {
    p_task_id: taskId,
    p_lat: latitude,
    p_lng: longitude,
    p_heading: heading,
    p_speed: speed,
    p_accuracy: accuracy,
  });
  if (error) throw error;
  return { sharing: !!data?.sharing, etaDue: !!data?.eta_due };
}

/** Officer: Stop / Resume sharing for this trip. */
export async function setLocationSharing(taskId, on) {
  const { error } = await supabase.rpc('officer_set_location_sharing', { p_task_id: taskId, p_on: on });
  if (error) throw error;
}

/** Asks the server to refresh the trip's ETA (Google Directions, key kept server-side). Best-effort. */
export async function refreshTripEta(taskId) {
  try {
    await supabase.functions.invoke('fleet-trip-eta', { body: { taskId } });
  } catch {
    // The ETA is a nice-to-have; the map keeps working without it.
  }
}

function normalizeLive(row) {
  return {
    taskId: row.task_id,
    bookingId: row.booking_id,
    type: row.type,
    status: row.status,
    officerName: row.officer_name,
    officerPhoto: row.officer_photo,
    vehicleNote: row.vehicle_note,
    officer: row.officer_lat != null && row.officer_lng != null
      ? { latitude: row.officer_lat, longitude: row.officer_lng, heading: row.officer_heading }
      : null,
    locationAt: row.location_at,
    destination: row.dest_lat != null && row.dest_lng != null ? { latitude: row.dest_lat, longitude: row.dest_lng } : null,
    destinationLabel: row.destination,
    etaSeconds: row.eta_seconds,
    etaDistance: row.eta_distance_m,
    etaSource: row.eta_source,
    etaUpdatedAt: row.eta_updated_at,
    routePolyline: row.route_polyline,
    sharing: !!row.sharing,
    conversationId: row.conversation_id,
  };
}

/** Renter: the live trip(s) on their booking (En route / Arrived). Pass a bookingId, or the booking chat's conversationId. */
export async function getRenterLiveTrips({ bookingId = null, conversationId = null }) {
  const { data, error } = await supabase.rpc('renter_trip_live', { p_booking_id: bookingId, p_conversation_id: conversationId });
  if (error) throw error;
  return (data ?? []).map(normalizeLive);
}

/** Renter: streams the officer's new location fixes for one trip (Supabase Realtime; row-level security limits it to their booking). */
export function subscribeToOfficerLocation(taskId, onFix) {
  const channel = supabase
    .channel(`officer-location-${taskId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'officer_locations', filter: `task_id=eq.${taskId}` }, (payload) => {
      const row = payload?.new;
      if (row) onFix({ latitude: row.lat, longitude: row.lng, heading: row.heading, recordedAt: row.recorded_at });
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** Officer: map / ETA / sharing state of their own trip. */
export async function getOfficerTripLive(taskId) {
  const { data, error } = await supabase.rpc('officer_trip_live', { p_task_id: taskId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    status: row.status,
    officer: row.officer_lat != null ? { latitude: row.officer_lat, longitude: row.officer_lng } : null,
    locationAt: row.location_at,
    destination: row.dest_lat != null ? { latitude: row.dest_lat, longitude: row.dest_lng } : null,
    etaSeconds: row.eta_seconds,
    etaDistance: row.eta_distance_m,
    etaSource: row.eta_source,
    routePolyline: row.route_polyline,
    sharing: !!row.sharing,
  };
}
