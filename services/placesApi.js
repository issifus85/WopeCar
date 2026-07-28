import { request } from './api';

/**
 * GET /api/places/autocomplete?input= - proxies Google Places (the key
 * stays server-side, see PlaceController::autocomplete on the backend).
 */
export async function searchPlaces(query) {
  const json = await request(`/places/autocomplete?input=${encodeURIComponent(query)}`, { auth: true });
  return json.data.map((raw) => ({
    description: raw.description,
    placeId: raw.placeId,
  }));
}
