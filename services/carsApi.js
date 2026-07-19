import { request } from './api';

// Array values (e.g. 'driven_by[]': ['Chauffeur', 'Self-drive']) need repeated
// keys - Laravel parses "driven_by[]=a&driven_by[]=b" into an array, but
// URLSearchParams given an array value would just stringify it into one entry.
function toQueryString(params) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach(v => searchParams.append(key, v));
    } else {
      searchParams.append(key, value);
    }
  });
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').trim();
}

// The API's gallery column can contain a trailing empty entry (stray
// trailing comma in the stored value), which resolves to a null URL.
function cleanGallery(gallery) {
  return (gallery ?? []).filter(Boolean);
}

/**
 * The API's date-availability filter (start/end) parses with Carbon's
 * 'd/m/Y' format, matching the web search - so dates must be sent as
 * DD/MM/YYYY, not ISO.
 */
export function formatDateParam(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

/**
 * Adapts the API's raw car shape (title, price/sale_price, passenger, gear,
 * door, location: {id,name}, type, ...) to what the app's UI expects (name,
 * pricePerDay, seats, transmission, location, ...).
 */
function normalizeCar(raw) {
  const hasSalePrice = raw.sale_price && raw.sale_price > 0 && raw.price > raw.sale_price;

  return {
    id: String(raw.id),
    name: raw.title || 'Untitled Car',
    type: raw.type ?? undefined,
    location: raw.location?.name ?? '',
    pricePerDay: hasSalePrice ? raw.sale_price : raw.price,
    seats: raw.passenger,
    transmission: raw.gear,
    doors: raw.door,
    baggage: raw.baggage,
    isFeatured: !!raw.is_featured,
    // search() already filters to status=publish, so every result here is
    // a live, bookable listing - this isn't checking specific dates yet.
    isAvailable: true,
    image: raw.image || null,
    bannerImage: raw.banner_image || null,
    gallery: raw.gallery?.length ? cleanGallery(raw.gallery) : raw.image ? [raw.image] : [],
    description: raw.content ? stripHtml(raw.content) : '',
    reviewScore: raw.review_score ?? null,
    drivenBy: raw.driven_by ?? null,
  };
}

/**
 * GET /api/cars
 *
 * Supported params: location_id, price_range ("min;max"),
 * "attrs[9][]" (car type - see CAR_TYPE_VALUES below), review_score,
 * service_name (title search), map_lat, map_lgn, map_place, is_featured,
 * special, driven_by, custom_ids, orderby, adults, children, limit, page,
 * start/end (availability window - use formatDateParam() to build these).
 */
export async function fetchCars(params = {}) {
  const json = await request(`/cars${toQueryString(params)}`);
  return {
    cars: json.data.map(normalizeCar),
    meta: json.meta,
  };
}

/**
 * GET /api/cars/{id}
 * Throws ApiError (status 404) if not found.
 */
export async function fetchCarById(id) {
  const json = await request(`/cars/${id}`);
  return normalizeCar(json.data);
}
