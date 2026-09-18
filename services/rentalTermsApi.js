import supabase from './supabase';

const DRIVE_TYPE_TITLES = {
  chauffeur: 'Chauffeured Rental — Terms & Conditions',
  self_drive: 'Self-Drive Rental — Terms & Conditions',
};

// Rental Terms & Conditions clauses shown on a car's detail screen
// (RentalTermsSection) and the standalone /rental-terms screen -
// admin-editable (Admin > Settings > Rental Terms & Conditions), split into
// two fixed sections by drive type. Supersedes the old hardcoded
// constants/rentalTerms.js content, which this now shapes its return value
// to match exactly ({ chauffeur: {title, clauses}, self_drive: {title,
// clauses} }) so callers barely needed to change.
// `requiresEnergySource` is left unfiltered here (e.g. the EV battery-
// charging clause) - RentalTermsSection filters it per car so this same
// fetch also serves the standalone /rental-terms reference screen, which
// has no specific car and should list every clause regardless of energy
// source.
export async function getRentalTermsSections() {
  const { data, error } = await supabase
    .from('rental_terms_clauses')
    .select('drive_type, title, body, requires_energy_source')
    .eq('is_published', true)
    .order('drive_type')
    .order('position');
  if (error) throw error;

  const grouped = { chauffeur: [], self_drive: [] };
  (data ?? []).forEach((row) => {
    grouped[row.drive_type]?.push({ title: row.title, body: row.body, requiresEnergySource: row.requires_energy_source });
  });

  return {
    chauffeur: { title: DRIVE_TYPE_TITLES.chauffeur, clauses: grouped.chauffeur },
    self_drive: { title: DRIVE_TYPE_TITLES.self_drive, clauses: grouped.self_drive },
  };
}
