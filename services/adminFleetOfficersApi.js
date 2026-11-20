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
