import supabase from './supabase';

// Replaces constants/vehicleCatalog.js's old hardcoded VEHICLE_MAKES/
// getModelsForMake - make/model are now admin-managed from wopecar-admin's
// Fleet > Makes & Models page (vehicle_makes/vehicle_models tables,
// migration 0126_add_vehicle_makes_and_models.sql), so a newly-added make
// or model (e.g. Toyota Coaster) shows up here too without an app update.

/** Active makes, for a Make picker's options list. */
export async function listVehicleMakes() {
  const { data, error } = await supabase.from('vehicle_makes').select('id, name').eq('is_active', true).order('position', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Active models for one make (by id), for a Model picker once a make is chosen. */
export async function listVehicleModelsForMake(makeId) {
  if (!makeId) return [];
  const { data, error } = await supabase.from('vehicle_models').select('id, name').eq('make_id', makeId).eq('is_active', true).order('position', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
