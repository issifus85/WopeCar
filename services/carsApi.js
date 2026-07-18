import { request } from './api';

function toQueryString(params) {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null && value !== ''
  );
  if (!entries.length) return '';
  return '?' + new URLSearchParams(entries).toString();
}

/**
 * GET /api/cars
 *
 * Supported params: location_id, price_range ("min;max"), attrs, review_score,
 * service_name (title search), map_lat, map_lgn, map_place, is_featured,
 * special, driven_by, custom_ids, orderby, adults, children, limit, page.
 *
 * Returns { cars, meta } where each car matches the API's raw shape:
 * { id, object_model, title, price, sale_price, discount_percent, image,
 *   content, location: { id, name }, is_featured, passenger, gear, baggage,
 *   door, review_score }
 */
export async function fetchCars(params = {}) {
  const json = await request(`/cars${toQueryString(params)}`);
  return {
    cars: json.data,
    meta: json.meta,
  };
}

/**
 * GET /api/cars/{id}
 *
 * Returns the single-car shape (superset of the list shape) with address,
 * map_lat/map_lng/map_zoom, banner_image, gallery[], video, extra_price,
 * review_stats, review_lists, faqs, cancel_policy, cancellation, terms,
 * related[]. Throws ApiError (status 404) if not found.
 */
export async function fetchCarById(id) {
  const json = await request(`/cars/${id}`);
  return json.data;
}
