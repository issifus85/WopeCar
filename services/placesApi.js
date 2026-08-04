import supabase from './supabase';

/**
 * Proxies Google Places via the places-autocomplete Edge Function (the key
 * stays server-side, same property the old Laravel endpoint had). Replaces
 * the legacy Laravel /places/autocomplete proxy, which required a Laravel
 * Sanctum token that's never been populated since auth moved to Supabase -
 * every call there silently 401'd, making every location search field in
 * the app (checkout pickup/return, admin/vendor car edit, vendor add-car)
 * return no results on every platform.
 */
export async function searchPlaces(query) {
  const { data, error } = await supabase.functions.invoke('places-autocomplete', { body: { input: query } });
  if (error) throw error;
  return (data?.data ?? []).map((raw) => ({
    description: raw.description,
    placeId: raw.placeId,
  }));
}
