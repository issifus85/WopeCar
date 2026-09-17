// One-time maintenance tool - populates media_folders rows that are
// completely empty in Storage even though their linked car has real
// photos. These 80 rows (car_id set, zero objects under
// media/<folder-name>/) were auto-seeded one-per-car as placeholders for a
// re-shoot effort; the actual current photos for those cars live in the
// `car-images` bucket instead (see migrate-car-photos-to-storage), which
// the admin Media page (components/media page in wopecar-admin) never
// browses - so a folder that legitimately has photos elsewhere still shows
// up there as "empty", which read as "missing photos" to the team.
//
// This supersedes attempting to reuse supabase/functions/
// backfill-car-media-folders/index.ts, which is the exact same trap
// migrate-car-photos-to-storage's own header comment already documents:
// marks a car "done" in a tracking table before verifying anything
// actually copied, and swallows per-image fetch/upload errors - every one
// of the cars it claims to have processed has zero objects in Storage.
//
// Batched and resumable: pass { limit } in the request body to bound how
// many NOT-YET-backfilled folders one invocation processes (default 10) -
// keeps each call well under the Edge Function execution time limit
// regardless of how many photos a car has. Re-invoke with the same or a
// larger limit until the response's `remaining` count is 0. A folder is
// only ever considered "backfilled" after every one of its car's photos
// copies successfully - a folder where any photo fails is left completely
// untouched (still empty, so a re-run will retry it) and reported in the
// response's `results` array with the specific error, instead of
// disappearing silently.
//
// Deploy with: supabase functions deploy backfill-empty-media-folders --no-verify-jwt
// (manually-triggered admin tool, invoked directly with the project's
// anon key from a terminal/script, not something end users or a cron job
// ever call)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BUCKET = 'media';

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
    // Escape hatch for a folder the normal candidate scan silently skips
    // (seen live: one row out of 80, cause not root-caused - the scan's
    // own `.select` with an embedded `cars:car_id(...)` relation came back
    // empty for this one row despite the car genuinely having images, on
    // every re-check) - bypasses discovery entirely and goes straight to
    // the copy loop for exactly this one folder.
    const onlyFolderId = typeof body.folderId === 'string' ? body.folderId : null;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    type FolderRow = { id: string; name: string; car_id: string; cars: { id: string; images: string[] | null } | null };

    let notYetBackfilled: FolderRow[];
    if (onlyFolderId) {
      const { data: folder, error: folderError } = await adminClient
        .from('media_folders')
        .select('id, name, car_id, cars:car_id(id, images)')
        .eq('id', onlyFolderId)
        .single();
      if (folderError) throw folderError;
      notYetBackfilled = [folder as unknown as FolderRow];
    } else {
      const { data: folders, error } = await adminClient
        .from('media_folders')
        .select('id, name, car_id, cars:car_id(id, images)')
        .not('car_id', 'is', null);
      if (error) throw error;
      const candidates = (folders ?? []) as unknown as FolderRow[];

      // Only a folder that's genuinely still empty AND whose car has
      // photos to backfill from is a candidate - checked fresh per
      // invocation (not cached) so a folder someone has since uploaded
      // real photos into is correctly skipped rather than overwritten.
      notYetBackfilled = [];
      for (const folder of candidates) {
        if (!folder.cars?.images?.length) continue;
        const { data: existing, error: listError } = await adminClient.storage.from(BUCKET).list(folder.name, { limit: 1 });
        if (listError) throw listError;
        if ((existing ?? []).length === 0) notYetBackfilled.push(folder);
      }
    }

    const batch = notYetBackfilled.slice(0, limit);

    const results: Array<Record<string, unknown>> = [];
    for (const folder of batch) {
      const images = folder.cars!.images!;
      const copiedPaths: string[] = [];
      let failure: { imageIndex: number; error: string } | null = null;

      for (let i = 0; i < images.length; i++) {
        const srcUrl = images[i];
        try {
          const res = await fetch(srcUrl);
          if (!res.ok) throw new Error(`source fetch returned ${res.status}`);
          const contentType = res.headers.get('content-type');
          const bytes = new Uint8Array(await res.arrayBuffer());
          const path = `${folder.name}/${i + 1}.${extensionFor(srcUrl, contentType)}`;

          const { error: uploadError } = await adminClient.storage
            .from(BUCKET)
            .upload(path, bytes, { contentType: contentType ?? 'image/jpeg', upsert: true });
          if (uploadError) throw new Error(`storage upload failed: ${uploadError.message}`);

          copiedPaths.push(path);
        } catch (e) {
          failure = { imageIndex: i, error: e instanceof Error ? e.message : String(e) };
          break;
        }
      }

      if (failure) {
        // Best-effort cleanup of any partial uploads so a retry doesn't
        // find the folder "non-empty" (and so skip it) without actually
        // being complete.
        if (copiedPaths.length > 0) await adminClient.storage.from(BUCKET).remove(copiedPaths);
        results.push({ folderId: folder.id, folderName: folder.name, status: 'failed', totalImages: images.length, ...failure });
        continue;
      }

      results.push({ folderId: folder.id, folderName: folder.name, status: 'backfilled', imageCount: copiedPaths.length });
    }

    const backfilledCount = results.filter((r) => r.status === 'backfilled').length;
    return jsonResponse({
      processed: batch.length,
      backfilled: backfilledCount,
      failed: batch.length - backfilledCount,
      remaining: notYetBackfilled.length - batch.length,
      results,
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
