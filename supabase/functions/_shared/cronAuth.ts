// Authentication for INTERNAL Edge Functions - ones only ever called by pg_cron jobs or DB
// triggers (send-*-reminders, send-app-update-notification, sync-google-reviews, ...). They are
// deployed with verify_jwt=false (the callers have no user session), which on its own meant anyone
// holding the public anon key could invoke them - e.g. push a notification to every user. The
// cron jobs / trigger functions now send an `x-cron-secret` header whose value lives in the private
// public.internal_secrets table (RLS on, no policies: service_role only); this checks it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isTrustedInternalCaller(req: Request): Promise<boolean> {
  const provided = req.headers.get('x-cron-secret');
  if (!provided) return false;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data } = await admin.from('internal_secrets').select('value').eq('name', 'cron').maybeSingle();
  return !!data?.value && timingSafeEqual(provided, data.value);
}

export function unauthorizedResponse() {
  return new Response(JSON.stringify({ error: 'Unauthorized.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
}

/** The shared secret itself, for server code (e.g. cancel-booking) that needs to call another internal function. */
export async function getInternalSecret(): Promise<string | null> {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data } = await admin.from('internal_secrets').select('value').eq('name', 'cron').maybeSingle();
  return data?.value ?? null;
}
