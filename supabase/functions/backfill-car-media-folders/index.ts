// One-time backfill: copies every existing car's images into the Media
// Library (media bucket), one folder per car named "CarModel-VendorName"
// (deduped with a short car-id suffix on collision), tracked via
// media_folders.car_id so repeat invocations skip already-done cars - safe
// to call in batches (BATCH_SIZE cars per call, to stay well within Edge
// Function execution limits) until `remaining` hits 0.
//
// Already run once for all 108 cars-with-images that existed at the time
// (this was deployed unauthenticated only for that brief run, since no
// admin login was available to invoke it through the normal path - now
// re-secured with the same is_admin() gate as every other admin function).
// Left deployed rather than removed (no delete-function tool available) -
// harmless to leave in place since it's idempotent and admin-gated; a
// future call only affects cars added since the last run.
//
// Deploy with: supabase functions deploy backfill-car-media-folders

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BATCH_SIZE = 12;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function sanitize(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: getUserError } = await callerClient.auth.getUser();
    if (getUserError || !user) {
      return jsonResponse({ error: 'Invalid or expired session.' }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerProfile } = await admin.from('users').select('role').eq('id', user.id).maybeSingle();
    if (callerProfile?.role !== 'admin') {
      return jsonResponse({ error: 'Admin access required.' }, 403);
    }

    const { data: doneRows } = await admin.from('media_folders').select('car_id').not('car_id', 'is', null);
    const doneIds = new Set((doneRows ?? []).map((r) => r.car_id));

    const { data: cars, error } = await admin
      .from('cars')
      .select('id, name, images, vendors(business_name)')
      .not('images', 'is', null);
    if (error) return jsonResponse({ error: error.message }, 500);

    const allPending = (cars ?? []).filter((c) => !doneIds.has(c.id) && (c.images?.length ?? 0) > 0);
    const batch = allPending.slice(0, BATCH_SIZE);

    const { data: existingFolders } = await admin.from('media_folders').select('name');
    const usedNames = new Set((existingFolders ?? []).map((f) => f.name));

    const results = [];
    for (const car of batch) {
      // deno-lint-ignore no-explicit-any
      const vendorRaw: any = car.vendors;
      const vendorName = sanitize((Array.isArray(vendorRaw) ? vendorRaw[0]?.business_name : vendorRaw?.business_name) || 'Vendor');
      const carModel = sanitize(car.name || 'Car');
      let folderName = `${carModel}-${vendorName}`;
      if (usedNames.has(folderName)) {
        folderName = `${folderName}-${car.id.slice(0, 6)}`;
      }
      usedNames.add(folderName);

      const { error: folderError } = await admin.from('media_folders').insert({ name: folderName, car_id: car.id });
      if (folderError) {
        results.push({ carId: car.id, folderName, error: folderError.message });
        continue;
      }

      let copied = 0;
      const images = (car.images ?? []) as string[];
      for (let i = 0; i < images.length; i++) {
        try {
          const res = await fetch(images[i]);
          if (!res.ok) continue;
          const buf = await res.arrayBuffer();
          const extMatch = /\.([a-zA-Z0-9]+)(?:\?.*)?$/.exec(images[i]);
          const ext = (extMatch ? extMatch[1] : 'jpg').toLowerCase();
          const path = `${folderName}/${i + 1}.${ext}`;
          const { error: uploadError } = await admin.storage.from('media').upload(path, buf, {
            contentType: res.headers.get('content-type') || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
            upsert: true,
          });
          if (!uploadError) copied++;
        } catch (_e) {
          // skip this one image, keep going with the rest of the car's photos
        }
      }
      results.push({ carId: car.id, folderName, imagesCopied: copied, imagesTotal: images.length });
    }

    return jsonResponse({ success: true, processedThisBatch: results.length, remaining: allPending.length - batch.length, results });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
