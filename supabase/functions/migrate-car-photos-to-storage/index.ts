// One-time migration tool, NOT a cron job - re-hosts car listing photos
// from the legacy Laravel origin (wopecar.com/uploads/...) into the
// `car-images` Supabase Storage bucket, then repoints cars.images at the
// new URLs. utils/imageUrl.js's resizeImageUrl() (the wsrv.nl resize proxy
// every car photo already renders through) keeps working unchanged - this
// only moves what it fetches from on a cache miss, from a slow/unreliable
// legacy host to a same-infra Supabase Storage origin.
//
// The `car-images` bucket and its RLS policies (car_images_admin_all,
// car_images_vendor_insert/update/delete, car_images_public_select) already
// existed, unused - they were clearly built for a vendor-facing car-photo
// upload flow that was never wired up (confirmed: no such UI exists
// anywhere in the mobile app or web admin). Their path convention is
// `{car.id}/...` (see car_images_vendor_insert's `storage.foldername(name))
// [1] = cars.id`), which is exactly the `{car.id}/{index+1}.{ext}` scheme
// used below - this migration is filling in a bucket that was already
// waiting for exactly this shape of data.
//
// This supersedes attempting to reuse supabase/functions/
// backfill-car-media-folders/index.ts, which turned out to be silently
// completely broken (marks a car "done" in a tracking table BEFORE
// verifying any image actually copied, and swallows per-image fetch/upload
// errors) - every one of the 108 cars it claims to have processed has zero
// objects in Storage. That function also writes into the general-purpose
// `media` bucket (the web admin's Media Library), not `car-images`, and
// never touches cars.images at all - it was never going to speed up the
// app's own read path even if it had worked.
//
// Batched and resumable, not a single pass over everything: pass
// { limit } in the request body to bound how many NOT-YET-migrated cars
// one invocation processes (default 10) - keeps each call well under the
// Edge Function execution time limit regardless of how many of a car's
// photos need fetching. Re-invoke with the same or a larger limit until
// the response's `remaining` count is 0. A car counts as "not yet
// migrated" if its first image URL isn't already a car-images public URL,
// so it's safe to re-run after a partial failure or an interruption - a
// car's images column is written ONLY after every one of its photos
// copies successfully (this fixes the old function's core bug: no more
// half-done cars silently marked complete). A car where any photo fails
// to copy is left completely
// untouched (original legacy URLs stay in cars.images) and reported in
// the response's `results` array with the specific error, instead of
// disappearing silently.
//
// Deploy with: supabase functions deploy migrate-car-photos-to-storage --no-verify-jwt
// (this is a manually-triggered admin tool, invoked directly with the
// project's anon key from a terminal/script during the migration, not
// something end users or a cron job ever call)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BUCKET = 'car-images';

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

function extensionFor(url: string, contentType: string | null) {
  const fromUrl = url.split('?')[0].split('.').pop()?.toLowerCase();
  if (fromUrl && /^[a-z0-9]{2,5}$/.test(fromUrl)) return fromUrl;
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('webp')) return 'webp';
  return 'jpg';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Number(body.limit) > 0 ? Number(body.limit) : 10;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Only 109 cars have any photos at all (1,127 photos total) - cheap
    // enough to fetch every candidate row on every invocation rather than
    // paginate, which sidesteps any risk of an offset scheme skipping or
    // re-visiting rows as cars get migrated between calls.
    const { data: cars, error } = await adminClient
      .from('cars')
      .select('id, images')
      .not('images', 'is', null);
    if (error) throw error;

    const publicUrlPrefix = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`;
    const notYetMigrated = (cars ?? []).filter(
      (c) => Array.isArray(c.images) && c.images.length > 0 && !c.images[0].startsWith(publicUrlPrefix)
    );
    const batch = notYetMigrated.slice(0, limit);

    const results: Array<Record<string, unknown>> = [];
    for (const car of batch) {
      const newUrls: string[] = [];
      let failure: { imageIndex: number; error: string } | null = null;

      for (let i = 0; i < car.images.length; i++) {
        const srcUrl = car.images[i];
        try {
          const res = await fetch(srcUrl);
          if (!res.ok) throw new Error(`source fetch returned ${res.status}`);
          const contentType = res.headers.get('content-type');
          const bytes = new Uint8Array(await res.arrayBuffer());
          const path = `${car.id}/${i + 1}.${extensionFor(srcUrl, contentType)}`;

          const { error: uploadError } = await adminClient.storage
            .from(BUCKET)
            .upload(path, bytes, { contentType: contentType ?? 'image/jpeg', upsert: true });
          if (uploadError) throw new Error(`storage upload failed: ${uploadError.message}`);

          newUrls.push(`${publicUrlPrefix}${path}`);
        } catch (e) {
          failure = { imageIndex: i, error: e instanceof Error ? e.message : String(e) };
          break;
        }
      }

      if (failure) {
        results.push({ carId: car.id, status: 'failed', totalImages: car.images.length, ...failure });
        continue;
      }

      const { error: updateError } = await adminClient.from('cars').update({ images: newUrls }).eq('id', car.id);
      if (updateError) {
        results.push({ carId: car.id, status: 'failed', error: `cars.images update failed: ${updateError.message}` });
        continue;
      }

      results.push({ carId: car.id, status: 'migrated', imageCount: newUrls.length });
    }

    const migratedCount = results.filter((r) => r.status === 'migrated').length;
    return jsonResponse({
      processed: batch.length,
      migrated: migratedCount,
      failed: batch.length - migratedCount,
      remaining: notYetMigrated.length - batch.length,
      results,
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
