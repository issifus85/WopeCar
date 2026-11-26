// Fleet Officer, Phase 4 (preprod until the release gate): the ETA the renter sees while an officer is on the way.
//
// POST { taskId }  (signed-in caller: the officer on that trip, the booking's renter, or an admin)
//
// Uses the officer's last position (trip_tasks.last_lat/lng, written by officer_share_location) and the trip's destination, asks Google
// Directions for drive time + route (the key stays here on the server - GOOGLE_DIRECTIONS_API_KEY, or the existing GOOGLE_PLACES_API_KEY
// when that key also has the Directions API enabled), and stores the result with fo_save_trip_eta. If Google fails, falls back to a
// straight-line estimate from the cached destination coordinates. Refreshes at most every 25 s per trip, whoever asks.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const MIN_REFRESH_MS = 25_000;
// Straight-line fallback: roads are ~1.4x the crow-flies distance in Accra, at an average ~22 km/h in city traffic.
const ROAD_FACTOR = 1.4;
const CITY_SPEED_MPS = 22_000 / 3600;

// The straight-line estimate only makes sense across a city; beyond this the officer isn't really on the way (or is testing from abroad).
const MAX_STRAIGHT_LINE_M = 200_000;

// Finds the destination's coordinates from its address, so the destination pin shows on the map even when no driving route can be
// found. Uses the same Places API the app's address search already uses (GOOGLE_PLACES_API_KEY), limited to Ghana.
async function geocodeAddress(address: string, keys: (string | undefined)[]): Promise<{ lat: number; lng: number } | null> {
  for (const key of keys) {
    if (!key) continue;
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/place/findplacefromtext/json');
      url.searchParams.set('input', /ghana/i.test(address) ? address : `${address}, Ghana`);
      url.searchParams.set('inputtype', 'textquery');
      url.searchParams.set('fields', 'geometry');
      url.searchParams.set('locationbias', 'rectangle:4.5,-3.3|11.2,1.3');
      url.searchParams.set('key', key);
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      const json = await res.json();
      const loc = json?.candidates?.[0]?.geometry?.location;
      if (json?.status === 'OK' && typeof loc?.lat === 'number' && typeof loc?.lng === 'number') return { lat: loc.lat, lng: loc.lng };
      console.warn('fleet-trip-eta: place lookup returned', json?.status, json?.error_message);
    } catch (e) {
      console.warn('fleet-trip-eta: place lookup failed', e);
    }
  }
  return null;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization header.' }, 401);
    const { taskId } = await req.json();
    if (!taskId) return jsonResponse({ error: 'taskId is required.' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const placesKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    const googleKey = Deno.env.get('GOOGLE_DIRECTIONS_API_KEY') ?? placesKey;

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) return jsonResponse({ error: 'Invalid or expired session.' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: task, error: taskError } = await admin
      .from('trip_tasks')
      .select('id, booking_id, type, status, officer_id, from_address, to_address, last_lat, last_lng, dest_lat, dest_lng, eta_updated_at, route_polyline')
      .eq('id', taskId)
      .maybeSingle();
    if (taskError || !task) return jsonResponse({ error: 'Trip not found.' }, 404);

    let allowed = task.officer_id === caller.id;
    if (!allowed && task.booking_id) {
      const { data: booking } = await admin.from('bookings').select('renter_id').eq('id', task.booking_id).maybeSingle();
      allowed = booking?.renter_id === caller.id;
    }
    if (!allowed) {
      const { data: profile } = await admin.from('users').select('role').eq('id', caller.id).maybeSingle();
      allowed = profile?.role === 'admin';
    }
    if (!allowed) return jsonResponse({ error: 'Not allowed.' }, 403);

    if (task.status !== 'en_route') return jsonResponse({ skipped: 'Trip is not on the way.' });
    if (task.last_lat == null || task.last_lng == null) return jsonResponse({ skipped: 'No officer location yet.' });
    if (task.eta_updated_at && Date.now() - new Date(task.eta_updated_at).getTime() < MIN_REFRESH_MS) {
      return jsonResponse({ skipped: 'Recently refreshed.' });
    }

    // Where the officer is heading: the renter's delivery address, or (return pickup) where the renter hands the car back.
    const destinationAddress = task.type === 'delivery' ? task.to_address : task.from_address;
    // No coordinates yet: look the address up once, so the pin shows even if no route is found. Saved below and reused after that.
    let geocoded: { lat: number; lng: number } | null = null;
    if ((task.dest_lat == null || task.dest_lng == null) && destinationAddress) {
      geocoded = await geocodeAddress(destinationAddress, [placesKey, googleKey]);
      if (geocoded) {
        task.dest_lat = geocoded.lat;
        task.dest_lng = geocoded.lng;
      }
    }
    const destination = task.dest_lat != null && task.dest_lng != null
      ? `${task.dest_lat},${task.dest_lng}`
      : destinationAddress ? `${destinationAddress}, Ghana` : null;
    if (!destination) return jsonResponse({ skipped: 'Trip has no destination.' });

    let result: { eta: number; distance: number; source: string; polyline: string | null; destLat: number | null; destLng: number | null } | null = null;

    // 1) Google Routes API (the current one, available to every Google Cloud project).
    if (googleKey) {
      try {
        const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': googleKey,
            'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.endLocation',
          },
          body: JSON.stringify({
            origin: { location: { latLng: { latitude: task.last_lat, longitude: task.last_lng } } },
            destination: task.dest_lat != null && task.dest_lng != null
              ? { location: { latLng: { latitude: task.dest_lat, longitude: task.dest_lng } } }
              : { address: destination },
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_AWARE',
            regionCode: 'gh',
          }),
          signal: AbortSignal.timeout(8000),
        });
        const json = await res.json();
        const route = json?.routes?.[0];
        if (res.ok && route?.duration) {
          const end = route.legs?.[0]?.endLocation?.latLng;
          result = {
            eta: Math.round(parseFloat(String(route.duration))),
            distance: Math.round(route.distanceMeters ?? 0),
            source: 'google',
            polyline: route.polyline?.encodedPolyline ?? null,
            destLat: end?.latitude ?? null,
            destLng: end?.longitude ?? null,
          };
        } else {
          console.warn('fleet-trip-eta: Routes API returned', res.status, json?.error?.message);
        }
      } catch (e) {
        console.warn('fleet-trip-eta: Routes API call failed', e);
      }
    }

    // 2) The older Directions API, for projects that still have it switched on.
    if (!result && googleKey) {
      try {
        const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
        url.searchParams.set('origin', `${task.last_lat},${task.last_lng}`);
        url.searchParams.set('destination', destination);
        url.searchParams.set('mode', 'driving');
        url.searchParams.set('departure_time', 'now');
        url.searchParams.set('region', 'gh');
        url.searchParams.set('key', googleKey);
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const json = await res.json();
        const leg = json?.routes?.[0]?.legs?.[0];
        if (json?.status === 'OK' && leg) {
          result = {
            eta: Math.round((leg.duration_in_traffic ?? leg.duration).value),
            distance: Math.round(leg.distance.value),
            source: 'google',
            polyline: json.routes[0].overview_polyline?.points ?? null,
            destLat: leg.end_location?.lat ?? null,
            destLng: leg.end_location?.lng ?? null,
          };
        } else {
          console.warn('fleet-trip-eta: Directions returned', json?.status, json?.error_message);
        }
      } catch (e) {
        console.warn('fleet-trip-eta: Directions call failed', e);
      }
    }

    if (!result && task.dest_lat != null && task.dest_lng != null) {
      const crow = haversineMeters(task.last_lat, task.last_lng, task.dest_lat, task.dest_lng);
      if (crow <= MAX_STRAIGHT_LINE_M) {
        const distance = crow * ROAD_FACTOR;
        result = {
          eta: Math.round(distance / CITY_SPEED_MPS), distance: Math.round(distance), source: 'straight_line', polyline: null,
          destLat: geocoded?.lat ?? null, destLng: geocoded?.lng ?? null,
        };
      }
    }
    if (!result) {
      // No route (e.g. the address can't be found, or the officer is far outside Ghana). Record that, so the app can say so instead of
      // "working out..." forever; the 25-second limit above keeps this from calling Google on every fix.
      await admin.rpc('fo_save_trip_eta', {
        p_task_id: task.id, p_eta_seconds: null, p_distance_m: null, p_source: 'unavailable', p_polyline: null,
        p_dest_lat: geocoded?.lat ?? null, p_dest_lng: geocoded?.lng ?? null,
      });
      return jsonResponse({ skipped: 'No route found to the destination.' });
    }

    const { error: saveError } = await admin.rpc('fo_save_trip_eta', {
      p_task_id: task.id,
      p_eta_seconds: result.eta,
      p_distance_m: result.distance,
      p_source: result.source,
      p_polyline: result.polyline,
      p_dest_lat: result.destLat ?? geocoded?.lat ?? null,
      p_dest_lng: result.destLng ?? geocoded?.lng ?? null,
    });
    if (saveError) return jsonResponse({ error: saveError.message }, 500);

    return jsonResponse({ etaSeconds: result.eta, distanceMeters: result.distance, source: result.source });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
