// Supabase Edge Function - proxies Google Places Autocomplete, replacing
// the old Laravel /places/autocomplete endpoint (services/placesApi.js).
// That endpoint required a Laravel Sanctum bearer token - nothing has
// written that token since auth moved to Supabase (see
// services/tokenStorage.js's own header comment), so every location search
// in the app (checkout pickup/return, admin/vendor car edit, vendor add-car)
// has been silently failing with 401 -> empty results on every platform.
// This keeps the same security property the Laravel version had (the
// Google API key never reaches the client) via a Supabase secret instead.
//
// Requires the GOOGLE_PLACES_API_KEY secret to be set:
//   supabase secrets set GOOGLE_PLACES_API_KEY=<key> --project-ref qvactycnufaowwsiqdrz
//
// Deploy with: supabase functions deploy places-autocomplete

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Supabase's function gateway (verify_jwt) already rejects anything
    // that isn't a legitimately signed project key/session before this code
    // runs, so no further identity check happens here. Deliberately doesn't
    // require a real user session (unlike most other Edge Functions this
    // project deploys) - the website's guest checkout doesn't mint one
    // until final submit (see website-guest-checkout), so a guest typing
    // into the pickup/return location field mid-checkout only ever has the
    // public anon key at this point, not a session - unlike mobile, where
    // every caller is already signed in. This proxy exposes no sensitive
    // data (just Google Places predictions), so that's a safe relaxation -
    // the same anon-safe, read-only precedent as validate_promo_code (see
    // [[website_instant_booking_cart]]).
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header.' }, 401);
    }

    const googlePlacesApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');

    if (!googlePlacesApiKey) {
      return jsonResponse({ error: 'GOOGLE_PLACES_API_KEY is not configured for this project.' }, 500);
    }

    const { input } = await req.json();
    if (!input || typeof input !== 'string' || !input.trim()) {
      return jsonResponse({ data: [] });
    }

    // components=country:gh - WopeCar only operates in Ghana; biasing
    // results to the country the whole app is built around avoids noisy
    // matches from anywhere else in the world for a short query string.
    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', input.trim());
    url.searchParams.set('components', 'country:gh');
    url.searchParams.set('key', googlePlacesApiKey);

    const googleRes = await fetch(url.toString());
    const googleJson = await googleRes.json();

    if (googleJson.status !== 'OK' && googleJson.status !== 'ZERO_RESULTS') {
      return jsonResponse({ error: `Google Places error: ${googleJson.status} ${googleJson.error_message ?? ''}`.trim() }, 502);
    }

    const data = (googleJson.predictions ?? []).map((p: { description: string; place_id: string }) => ({
      description: p.description,
      placeId: p.place_id,
    }));

    return jsonResponse({ data });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
