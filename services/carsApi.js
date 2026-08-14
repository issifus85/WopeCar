import supabase from './supabase';
import { CAR_FEATURES } from '../constants/vehicleCatalog';

const FEATURE_BY_SLUG = new Map(CAR_FEATURES.map((f) => [f.slug, f]));

const HTML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeHtmlEntities(str) {
  return str.replace(/&(#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') return String.fromCharCode(parseInt(entity.slice(1), 10));
    return HTML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

// Admin's description field is now the shared Tiptap rich text editor
// (components/ui/RichTextEditor.tsx in wopecar-admin), which stores real
// HTML. This app still renders `description` as a single plain <Text> in
// app/car/[id].js, so that HTML needs flattening to text - and to the same
// "\n\n" paragraph breaks + "✔ " bullet convention every legacy plain-text
// row already uses (see supabase/scripts/set-car-descriptions.mjs), so an
// admin's rich-text edit reads identically to the un-edited rows around it.
function htmlToPlainText(html) {
  if (!html) return '';
  if (!/<[a-z][\s\S]*>/i.test(html)) return html.trim();

  let working = html.replace(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi, (_, _tag, inner) => {
    const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((m) => decodeHtmlEntities(m[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .map((text) => `✔ ${text}`);
    return items.length ? `\n\n${items.join('\n')}\n\n` : '';
  });

  working = working
    .replace(/<\/(p|div|h[1-6]|blockquote)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  working = decodeHtmlEntities(working);

  return working
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Older migrated rows still have the standard Chauffeured/Self-Drive rental
// T&Cs pasted directly into `description` (now rendered properly by
// components/RentalTermsSection.js instead, from constants/rentalTerms.js).
// Cut it off client-side so a car whose Supabase row hasn't been through
// supabase/scripts/set-car-descriptions.mjs yet doesn't dump that whole
// block into the Description section.
const LEGACY_TERMS_MARKER = /Chauffeured Rental\s*[–-]\s*Terms/i;
function stripLegacyTermsBlock(description) {
  const match = LEGACY_TERMS_MARKER.exec(description);
  return match ? description.slice(0, match.index).trim() : description;
}

/**
 * Adapts a Supabase `cars` row (+ optionally joined `vendor_public_profiles`
 * row) to the exact same app-facing shape this file always produced from
 * Laravel, so none of this file's 10 call sites (app/(tabs)/index.js,
 * app/car/[id].js, app/(tabs)/{favorites,cart}.js, app/booking/[id].js,
 * app/checkout/{payment,addons,summary,dates}.js,
 * app/rental-agreement/[bookingId].js) need to change.
 *
 * reviewScore/reviews still have no Supabase equivalent (no reviews/ratings
 * table backing this file directly - see attachRatings for the one place
 * ratings actually get attached to list results, not per-car detail).
 * `faqs` does have a real per-car equivalent now (the `cars.faqs`
 * jsonb column, backfilled from the original Bravo/Laravel export via
 * supabase/scripts/data/bravo_cars.json - not every car has FAQs, only the
 * ones that did in the source data).
 */
function normalizeCar(raw) {
  const features = (raw.features ?? [])
    .map((slug) => {
      const known = FEATURE_BY_SLUG.get(slug);
      return known || { id: slug, slug, title: slug };
    });

  return {
    id: raw.id,
    vendorId: raw.vendor_id ?? null,
    name: raw.name || 'Untitled Car',
    type: raw.type ?? undefined,
    location: raw.location ?? '',
    pricePerDay: raw.price_per_day,
    seats: raw.seats,
    transmission: raw.transmission,
    doors: raw.doors ?? undefined,
    baggage: raw.baggage ?? undefined,
    vehicleClass: raw.vehicle_class ?? undefined,
    isRecommended: !!raw.is_recommended,
    createdAt: raw.created_at,
    isAvailable: raw.status === 'active',
    image: raw.images?.[0] ?? null,
    bannerImage: raw.images?.[0] ?? null,
    gallery: raw.images ?? [],
    description: raw.description ? stripLegacyTermsBlock(htmlToPlainText(raw.description)) : '',
    reviewScore: undefined, // no reviews/ratings table - Home/Detail already handle this being absent
    drivenBy: raw.drive_type ?? null,
    energySource: raw.energy_source ?? null,
    faqs: raw.faqs ?? [],
    cancellationPolicy: raw.cancellation_policy ? htmlToPlainText(raw.cancellation_policy) : null,
    features,
    reviews: [],
    owner: raw.vendor ? {
      name: raw.vendor.business_name,
      avatar: raw.vendor.avatar,
      memberSince: raw.vendor.member_since,
      isVerified: !!raw.vendor.is_approved,
    } : null,
    regionalAddons: (raw.regional_addons ?? []).map((addon) => ({
      name: addon.name,
      price: Number(addon.price) || 0,
      type: addon.type,
    })),
    discount: {
      enabled: !!raw.discount_enabled,
      type: raw.discount_type ?? 'percentage',
      value: raw.discount_value != null ? Number(raw.discount_value) : null,
      startsAt: raw.discount_starts_at ?? null,
      endsAt: raw.discount_ends_at ?? null,
    },
    lengthOfStayDiscounts: raw.length_of_stay_discounts ?? [],
  };
}

/**
 * Attaches each car's live average rating (published reviews only) - reviews
 * live in their own table (see supabase/migrations' add_reviews_table), not
 * a column on `cars`. One extra query for the whole result set's review rows
 * (not N+1 - a single `.in('car_id', ids)` covers every car already
 * fetched). Called unconditionally by fetchCars (not just for the
 * 'rate_high_low' sort) since CarTileCard/CarListCard now show a rating
 * badge on every card, not only when sorted by rating.
 */
async function attachRatings(cars) {
  const carIds = cars.map((c) => c.id);
  if (carIds.length === 0) return cars;

  const { data: reviewRows, error } = await supabase
    .from('reviews')
    .select('car_id, overall_rating')
    .eq('is_published', true)
    .in('car_id', carIds);
  if (error) throw error;

  const sums = {};
  const counts = {};
  (reviewRows ?? []).forEach((row) => {
    sums[row.car_id] = (sums[row.car_id] ?? 0) + row.overall_rating;
    counts[row.car_id] = (counts[row.car_id] ?? 0) + 1;
  });

  return cars.map((car) => ({
    ...car,
    rating: counts[car.id] ? sums[car.id] / counts[car.id] : null,
    reviewCount: counts[car.id] ?? 0,
  }));
}

/**
 * Sorts by rating descending, unrated cars last. Client-side sort is safe
 * here specifically because fetchCars has no real pagination today (see its
 * own doc comment - `page` is accepted but nothing currently passes it,
 * `limit` is rarely used) - every matching car is already in `cars` before
 * this runs.
 */
function sortByRatingDesc(cars) {
  return [...cars].sort((a, b) => {
    if (a.rating == null && b.rating == null) return 0;
    if (a.rating == null) return 1;
    if (b.rating == null) return -1;
    return b.rating - a.rating;
  });
}

/**
 * Supported filters: type (string or string[]), driveType (string or
 * string[]), vehicleClass (string or string[]), seats (number or number[]),
 * location (string or string[] - substring match against `location`, not an
 * exact/enum match, since a car's location is a free-text string, not a
 * fixed region), minPrice, maxPrice, orderBy ('price_low_high' |
 * 'price_high_low' | 'rate_high_low' - sorts by real review data, see
 * attachRatings/sortByRatingDesc; 'recommended' - admin-curated via
 * cars.is_recommended, see app/admin/car/edit/[id].js, tagged cars first,
 * newest-first tiebreak; 'latest' - newest first by created_at, real
 * column, no tagging needed), limit, page.
 *
 * 'recommended' and 'latest' both order the *whole* list rather than
 * filtering down to just the tagged/recent subset - a "sort" that could
 * return an empty or tiny list whenever nothing currently qualifies would
 * be a worse experience than just deprioritizing the rest.
 *
 * When params.startDate/endDate (both 'YYYY-MM-DD') are given, cars with an
 * overlapping paid booking or a vendor-set blocked date in that range are
 * excluded via fetchUnavailableCarIds() below - see that function's own
 * comment for exactly what counts as "unavailable".
 */
export async function fetchCars(params = {}) {
  let query = supabase.from('cars').select('*', { count: 'exact' }).eq('status', 'active');

  if (params.type) {
    query = Array.isArray(params.type) ? query.in('type', params.type) : query.eq('type', params.type);
  }
  if (params.driveType) {
    query = Array.isArray(params.driveType) ? query.in('drive_type', params.driveType) : query.eq('drive_type', params.driveType);
  }
  if (params.vehicleClass) {
    query = Array.isArray(params.vehicleClass) ? query.in('vehicle_class', params.vehicleClass) : query.eq('vehicle_class', params.vehicleClass);
  }
  if (params.seats) {
    query = Array.isArray(params.seats) ? query.in('seats', params.seats) : query.eq('seats', params.seats);
  }
  if (params.location) {
    // OR'd substring matches, e.g. ['Accra', 'Kumasi'] -> cars in Accra OR
    // Kumasi - each term needs its own %...% ilike, PostgREST's .or() takes
    // a single comma-joined filter-list string rather than an array.
    const locations = Array.isArray(params.location) ? params.location : [params.location];
    query = query.or(locations.map((loc) => `location.ilike.%${loc}%`).join(','));
  }
  if (params.minPrice) query = query.gte('price_per_day', params.minPrice);
  if (params.maxPrice) query = query.lte('price_per_day', params.maxPrice);

  if (params.orderBy === 'price_low_high') query = query.order('price_per_day', { ascending: true });
  else if (params.orderBy === 'price_high_low') query = query.order('price_per_day', { ascending: false });
  else if (params.orderBy === 'recommended') query = query.order('is_recommended', { ascending: false }).order('created_at', { ascending: false });
  else if (params.orderBy === 'latest') query = query.order('created_at', { ascending: false });

  if (params.limit) query = query.limit(params.limit);

  const { data, count, error } = await query;
  if (error) throw error;

  let cars = data.map(normalizeCar);

  // Filtered client-side after the fact rather than as a `.not('id','in',...)`
  // clause on the query above - the only real caller (app/(tabs)/index.js)
  // never combines this with params.limit, so there's no page-size
  // under-fetch to worry about here. Would need revisiting if a future
  // caller ever paginates a date-filtered search.
  const hasDateRange = params.startDate && params.endDate;
  if (hasDateRange) {
    const unavailableIds = await fetchUnavailableCarIds(params.startDate, params.endDate);
    cars = cars.filter((car) => !unavailableIds.has(car.id));
  }

  cars = await attachRatings(cars);
  if (params.orderBy === 'rate_high_low') {
    cars = sortByRatingDesc(cars);
  }

  return {
    cars,
    meta: { total: hasDateRange ? cars.length : (count ?? data.length) },
  };
}

/**
 * Car ids unavailable for a given ['YYYY-MM-DD', 'YYYY-MM-DD'] range, used
 * by fetchCars() above to filter search results. Two independent sources,
 * matching the "booked/blocked/unavailable" language used everywhere else
 * in the app:
 *   - real, paid, non-cancelled bookings that overlap the range - fetched
 *     via the get_unavailable_car_ids() RPC (0044_add_get_unavailable_car_
 *     ids_rpc.sql), NOT a direct `.from('bookings')` query - bookings_renter_
 *     select/bookings_vendor_select RLS scope a normal SELECT to the
 *     caller's own bookings/cars only (bookings carries PII), so a renter
 *     searching would only ever see their own bookings filtered out, not
 *     other renters' bookings on the same cars. The RPC is SECURITY DEFINER
 *     and returns only car_id, matching the same "derived fact, not row
 *     access" pattern as get_partner_stats(). This also means it reflects
 *     what's actually enforced at booking time, not just what happens to be
 *     in the `availability` table below (advisory/derived - see
 *     fetchCarAvailability's own comment - and, since cancel-booking never
 *     cleans up `availability` rows, can go stale after a cancellation).
 *   - vendor-set manual blocks (`availability.status = 'blocked'`), which
 *     have no equivalent in `bookings` at all - availability_public_select
 *     already allows reading this directly for any active car, no RPC
 *     needed.
 * A pending/unpaid booking does NOT block a car here - it's not a
 * confirmed hold on those dates yet, same reasoning the exclusion
 * constraint itself uses.
 */
export async function fetchUnavailableCarIds(startDate, endDate) {
  const [bookingsRes, blockedRes] = await Promise.all([
    supabase.rpc('get_unavailable_car_ids', { p_start_date: startDate, p_end_date: endDate }),
    supabase
      .from('availability')
      .select('car_id')
      .eq('status', 'blocked')
      .gte('date', startDate)
      .lte('date', endDate),
  ]);
  if (bookingsRes.error) throw bookingsRes.error;
  if (blockedRes.error) throw blockedRes.error;

  const ids = new Set();
  (bookingsRes.data ?? []).forEach((row) => ids.add(row.car_id));
  (blockedRes.data ?? []).forEach((row) => ids.add(row.car_id));
  return ids;
}

/**
 * Single car with vendor info joined via vendor_public_profiles (never the
 * raw `vendors` table - that has private columns like bank details).
 * Throws if not found (RLS-invisible cars, e.g. someone else's pending
 * listing, look the same as "doesn't exist" to a caller here - same
 * external behavior as Laravel's 404).
 */
export async function fetchCarById(id) {
  const { data: car, error } = await supabase.from('cars').select('*').eq('id', id).single();
  if (error) throw error;

  let vendor = null;
  if (car.vendor_id) {
    const { data: vendorRow } = await supabase
      .from('vendor_public_profiles')
      .select('*')
      .eq('id', car.vendor_id)
      .maybeSingle();
    vendor = vendorRow;
  }

  return normalizeCar({ ...car, vendor });
}

/**
 * Returns this car's booked/blocked date ranges as [{start: Date, end:
 * Date}], collapsing the `availability` table's one-row-per-date shape into
 * the range shape app/checkout/dates.js already expects - so that call site
 * needs no changes. Will be empty for every migrated car (no bravo_car_dates
 * import this phase - matches Laravel's own "advisory only" behavior today,
 * since nothing currently enforces availability at booking-creation time
 * either way).
 */
export async function fetchCarAvailability(id) {
  const { data, error } = await supabase
    .from('availability')
    .select('date, status')
    .eq('car_id', id)
    .order('date', { ascending: true });
  if (error) throw error;

  const ranges = [];
  let rangeStart = null;
  let prevDate = null;

  const toDate = (isoDate) => new Date(`${isoDate}T00:00:00`);

  for (const row of data) {
    const d = toDate(row.date);
    if (rangeStart && prevDate && d - prevDate === 86400000) {
      prevDate = d;
      continue;
    }
    if (rangeStart) ranges.push({ start: rangeStart, end: prevDate });
    rangeStart = d;
    prevDate = d;
  }
  if (rangeStart) ranges.push({ start: rangeStart, end: prevDate });

  return ranges;
}

/**
 * Same underlying `availability` table as fetchCarAvailability(), but kept
 * as separate ISO-date sets by status rather than collapsed into ranges -
 * for callers that need to tell a real booking apart from a vendor-set
 * block (the admin per-car availability screen, and the read-only calendar
 * on the renter-facing car details screen), not just "is this date takeable
 * or not" like app/checkout/dates.js.
 */
export async function fetchCarAvailabilityByStatus(id) {
  const { data, error } = await supabase
    .from('availability')
    .select('date, status')
    .eq('car_id', id);
  if (error) throw error;

  const bookedDates = new Set();
  const blockedDates = new Set();
  (data ?? []).forEach((row) => {
    (row.status === 'booked' ? bookedDates : blockedDates).add(row.date);
  });
  return { bookedDates, blockedDates };
}
