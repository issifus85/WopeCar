import supabase from './supabase';

// Admin management of Fleet officers (migration 0179). Every call goes through an admin-only SECURITY DEFINER RPC, so the rules
// (existing accounts only, no suspended accounts, deactivating unassigns open tasks) live in the database, not here.

export async function listFleetOfficers() {
  const { data, error } = await supabase.rpc('admin_list_fleet_officers');
  if (error) throw error;
  return data ?? [];
}

/** Makes an existing account a Fleet officer, or edits an officer's display name / vehicle note. */
export async function upsertFleetOfficer({ userId, displayName = null, vehicleNote = null }) {
  const { data, error } = await supabase.rpc('admin_upsert_fleet_officer', {
    p_user_id: userId,
    p_display_name: displayName,
    p_vehicle_note: vehicleNote,
  });
  if (error) throw error;
  return data;
}

export async function setFleetOfficerActive(userId, active) {
  const { data, error } = await supabase.rpc('admin_set_fleet_officer_active', { p_user_id: userId, p_active: active });
  if (error) throw error;
  return data;
}

// ---- trip tasks (migration 0180) ----

export async function listTripTasks({ bookingId = null, from = null, to = null } = {}) {
  const { data, error } = await supabase.rpc('admin_list_trip_tasks', { p_booking_id: bookingId, p_from: from, p_to: to });
  if (error) throw error;
  return data ?? [];
}

/** officerId null = unassign. The database adds / removes the officer in the booking chat and sends the pushes. */
export async function assignTripTask(taskId, officerId) {
  const { error } = await supabase.rpc('admin_assign_trip_task', { p_task_id: taskId, p_officer_id: officerId });
  if (error) throw error;
}

/** Creates the delivery + collection tasks for a confirmed booking (e.g. one confirmed before Fleet Officer existed). */
export async function ensureTripTasks(bookingId) {
  const { error } = await supabase.rpc('admin_ensure_trip_tasks', { p_booking_id: bookingId });
  if (error) throw error;
}
