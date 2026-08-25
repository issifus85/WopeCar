// Supabase Edge Function - pulls WopeCar's Google Business Profile reviews
// via the Places API and upserts them into the `testimonials` table
// (source='google') for the public website's testimonials carousel.
//
// Only reviews with rating >= 4 are auto-published - Google's Place
// Details endpoint returns its own "most relevant" mix (not guaranteed
// all 5-star), so this is a simple content-quality gate. Lower-rated
// synced reviews still get stored (is_published=false) for an admin to
// review manually later - there's no admin UI for that yet, this just
// avoids silently dropping them.
//
// Google's classic Places API caps this at 5 reviews per place - there is
// no pagination. Re-running this is safe (upsert on external_id, built
// from placeId+review time - Google doesn't expose a stable review ID).
//
// Fired daily by a pg_cron job (see migration
// 0092_add_google_reviews_sync_cron.sql), not by an admin session - no
// admin UI ever called this (it was previously gated on a live admin JWT,
// which a cron job can't provide), so it had silently never run again
// after the one-time manual backfill on 2026-08-05. Re-gated the same way
// send-document-expiry-reminders and send-vetting-appointment-reminders
// are: verify_jwt off, no per-request identity check, because the only
// inputs this function trusts are its own project secrets (never the
// caller) and it only writes Google's own already-public review content -
// there is nothing a malicious caller could inject or steal by invoking
// this early.
//
// Requires two secrets set on the project:
//   GOOGLE_PLACES_API_KEY - a Google Cloud API key with Places API enabled
//   GOOGLE_PLACE_ID       - WopeCar's Google Business Profile Place ID
//   (ChIJW8gSKveU2w8RPPeTI780EFI - see wopecar_website_google_reviews memory)
//
// Deploy with: supabase functions deploy sync-google-reviews --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

type GoogleReview = {
  author_name: string;
  rating: number;
  text: string;
  time: number;
  relative_time_description?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    const placeId = Deno.env.get('GOOGLE_PLACE_ID');

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (!googleApiKey || !placeId) {
      return jsonResponse({ error: 'GOOGLE_PLACES_API_KEY and GOOGLE_PLACE_ID must both be set as project secrets.' }, 500);
    }

    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', 'reviews,rating,user_ratings_total');
    url.searchParams.set('key', googleApiKey);

    const placesRes = await fetch(url.toString());
    const placesJson = await placesRes.json();

    if (placesJson.status !== 'OK') {
      return jsonResponse({ error: `Google Places API error: ${placesJson.status} - ${placesJson.error_message ?? 'no details'}` }, 502);
    }

    const reviews: GoogleReview[] = placesJson.result?.reviews ?? [];
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const review of reviews) {
      const externalId = `google-${placeId}-${review.time}`;
      const isPublished = review.rating >= 4;

      const { data: existing } = await adminClient.from('testimonials').select('id').eq('external_id', externalId).maybeSingle();

      const row = {
        author_name: review.author_name,
        review: review.text,
        rating: review.rating,
        source: 'google',
        external_id: externalId,
        is_published: isPublished,
      };

      if (existing) {
        const { error } = await adminClient.from('testimonials').update(row).eq('id', existing.id);
        if (error) { skipped++; continue; }
        updated++;
      } else {
        const { error } = await adminClient.from('testimonials').insert(row);
        if (error) { skipped++; continue; }
        inserted++;
      }
    }

    return jsonResponse({
      success: true,
      fetched: reviews.length,
      inserted,
      updated,
      skipped,
      googleRating: placesJson.result?.rating ?? null,
      googleReviewCount: placesJson.result?.user_ratings_total ?? null,
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
