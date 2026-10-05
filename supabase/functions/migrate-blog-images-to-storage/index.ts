// One-time migration tool, NOT a cron job - re-hosts blog post images from
// the legacy Laravel origin (wopecar.com/uploads/...) into the public
// `blog-images` Supabase Storage bucket and rewrites blog_posts.cover_image,
// og_image and content to the new URLs. Needed because wopecar.com's DNS
// cut-over to the new website stops the old server serving /uploads.
//
// Same safety shape as migrate-car-photos-to-storage: batched + resumable
// ({ limit } posts per call, default 10, re-invoke until `remaining` is 0),
// and a post is written ONLY after every one of its images copied
// successfully - a post with any failure is left completely untouched and
// reported in `results`. The storage path mirrors the legacy path
// (uploads/0000/25/2025/10/08/x.jpeg -> 0000/25/2025/10/08/x.jpeg) so the
// copy is deterministic and idempotent (upsert). The original column values
// are saved to blog_image_migration_backup first, so it can be reverted.
// Pass { skipDead: true } to copy everything that CAN be fetched and leave a
// source URL that already errors on the legacy host untouched (reported in
// `deadImages`) instead of failing the whole post - used for images that were
// already broken before the migration.
//
// Deploy with: supabase functions deploy migrate-blog-images-to-storage
// (JWT-verified; invoke with the project's anon key). Delete the function
// once the migration is done.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BUCKET = 'blog-images';
const LEGACY_URL_RE = /https?:\/\/(?:www\.)?wopecar\.com\/uploads\/[^"'\\\s)<>,]+/g;

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

function hasLegacy(value: string | null) {
  return !!value && /wopecar\.com\/uploads\//.test(value);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Number(body.limit) > 0 ? Number(body.limit) : 10;
    const skipDead = body.skipDead === true;
    const deadImages: string[] = [];

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const adminClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const publicUrlPrefix = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`;

    const { data: posts, error } = await adminClient.from('blog_posts').select('id, slug, cover_image, og_image, content');
    if (error) throw error;

    const pending = (posts ?? []).filter((p) => hasLegacy(p.cover_image) || hasLegacy(p.og_image) || hasLegacy(p.content));
    const batch = pending.slice(0, limit);

    // Same file referenced from cover_image and og_image (and the body) is
    // only fetched once per call.
    const cache = new Map<string, string>();
    async function rehost(srcUrl: string) {
      const cached = cache.get(srcUrl);
      if (cached) return cached;
      const path = new URL(srcUrl).pathname.replace(/^\/uploads\//, '');
      const res = await fetch(srcUrl);
      if (!res.ok) {
        if (skipDead) {
          deadImages.push(srcUrl);
          return srcUrl;
        }
        throw new Error(`source fetch returned ${res.status} for ${srcUrl}`);
      }
      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      if (!contentType.startsWith('image/')) throw new Error(`not an image (${contentType}) for ${srcUrl}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const { error: uploadError } = await adminClient.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
      if (uploadError) throw new Error(`storage upload failed for ${srcUrl}: ${uploadError.message}`);
      const newUrl = `${publicUrlPrefix}${path}`;
      cache.set(srcUrl, newUrl);
      return newUrl;
    }

    async function rewrite(value: string | null) {
      if (!value) return value;
      const urls = Array.from(new Set(value.match(LEGACY_URL_RE) ?? []));
      let out = value;
      for (const u of urls) out = out.split(u).join(await rehost(u));
      return out;
    }

    const results: Array<Record<string, unknown>> = [];
    for (const post of batch) {
      try {
        const cover = await rewrite(post.cover_image);
        const og = await rewrite(post.og_image);
        const content = await rewrite(post.content);

        await adminClient.from('blog_image_migration_backup').upsert(
          { blog_post_id: post.id, cover_image: post.cover_image, og_image: post.og_image, content: post.content },
          { onConflict: 'blog_post_id', ignoreDuplicates: true }
        );
        const { error: updateError } = await adminClient
          .from('blog_posts')
          .update({ cover_image: cover, og_image: og, content })
          .eq('id', post.id);
        if (updateError) throw new Error(`blog_posts update failed: ${updateError.message}`);
        results.push({ slug: post.slug, status: 'migrated' });
      } catch (e) {
        results.push({ slug: post.slug, status: 'failed', error: e instanceof Error ? e.message : String(e) });
      }
    }

    const migrated = results.filter((r) => r.status === 'migrated').length;
    return jsonResponse({ processed: batch.length, migrated, failed: batch.length - migrated, remaining: pending.length - migrated, deadImages, results });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
