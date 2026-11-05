// Supabase Edge Function - cron-triggered (daily, see migration
// 0108_add_promo_notification_campaigns.sql), scans promo_notification_
// campaigns for anything due and sends it as both an in-app notification
// row and a real push (via send-push-notification, using this function's
// own service-role call as a trusted internal caller - same pattern as
// send-booking-ending-reminders).
//
// "Due" means: is_active, started (starts_at <= today), not yet ended
// (ends_at is null or >= today), and either never sent (frequency_days is
// null - one-time) or enough days have elapsed since last_sent_at
// (frequency_days is a positive integer - recurring). A one-time campaign
// is flipped to is_active = false right after its single send, same
// guard-column spirit as every other one-shot reminder in this codebase.
//
// Deploy with: supabase functions deploy send-promo-notifications --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isTrustedInternalCaller, unauthorizedResponse } from '../_shared/cronAuth.ts';

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

const TARGET_ROLE: Record<string, string> = { renters: 'renter', vendors: 'vendor', admins: 'admin' };

type Campaign = {
  id: string;
  title: string;
  body: string;
  target: string;
  frequency_days: number | null;
  starts_at: string;
  ends_at: string | null;
  last_sent_at: string | null;
  audience: string;
};

// Whole-day comparison: the cron fires once a day at roughly the same time,
// but a few ms of jitter used to make "last_sent_at + N days <= now" fail on
// alternate days, so an every-1-day campaign only went out every other day.
function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isDue(campaign: Campaign, todayIso: string): boolean {
  if (campaign.starts_at > todayIso) return false;
  if (campaign.ends_at && campaign.ends_at < todayIso) return false;
  if (campaign.frequency_days == null) return !campaign.last_sent_at;
  if (!campaign.last_sent_at) return true;
  return addDaysIso(campaign.last_sent_at, campaign.frequency_days) <= todayIso;
}

// PostgREST returns at most 1000 rows per request (the project's max-rows),
// so an unpaged select silently stopped every campaign at the first 1000
// users. Page through all of them.
const PAGE_SIZE = 1000;
// Users per send-push-notification call: keeps its push_tokens .in() filter
// and per-user badge queries small enough to finish well inside its limits.
const PUSH_BATCH = 200;
const INSERT_BATCH = 500;

// deno-lint-ignore no-explicit-any
async function fetchTargetUserIds(adminClient: any, target: string): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = adminClient.from('users').select('id').order('id').range(from, from + PAGE_SIZE - 1);
    if (target !== 'all') q = q.eq('role', TARGET_ROLE[target]);
    const { data, error } = await q;
    if (error) throw error;
    (data ?? []).forEach((u: { id: string }) => ids.push(u.id));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return ids;
}

const ACTIVE_APP_DAYS = 30;

// Users whose app re-registered its push token recently (every cold start /
// sign-in calls register_push_token, which bumps push_tokens.updated_at).
// deno-lint-ignore no-explicit-any
async function fetchActiveAppUserIds(adminClient: any, days: number): Promise<Set<string>> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await adminClient
      .from('push_tokens')
      .select('user_id')
      .gte('updated_at', since)
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    (data ?? []).forEach((r: { user_id: string }) => ids.add(r.user_id));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return ids;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Internal-only (cron / DB trigger): reject anyone without the shared secret.
  if (!(await isTrustedInternalCaller(req))) return unauthorizedResponse();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);

    const { data: campaigns, error } = await adminClient
      .from('promo_notification_campaigns')
      .select('id, title, body, target, frequency_days, starts_at, ends_at, last_sent_at, audience')
      .eq('is_active', true);
    if (error) throw error;

    let campaignsSent = 0;
    let notificationsSent = 0;
    let pushesSent = 0;
    let pushesFailed = 0;

    for (const campaign of (campaigns ?? []) as Campaign[]) {
      if (!isDue(campaign, todayIso)) continue;

      let userIds: string[];
      try {
        userIds = await fetchTargetUserIds(adminClient, campaign.target);
        if (campaign.audience === 'app_active_30d') {
          const active = await fetchActiveAppUserIds(adminClient, ACTIVE_APP_DAYS);
          userIds = userIds.filter((id) => active.has(id));
        }
      } catch (usersError) {
        console.error(`promo campaign ${campaign.id}: could not resolve target users`, usersError);
        continue;
      }

      for (const ids of chunk(userIds, INSERT_BATCH)) {
        const rows = ids.map((id) => ({ user_id: id, type: 'promo', title: campaign.title, body: campaign.body }));
        const { error: insertError } = await adminClient.from('notifications').insert(rows);
        if (insertError) console.error(`promo campaign ${campaign.id}: notification insert failed`, insertError);
      }

      // functions.invoke() resolves with { error } instead of throwing, so the
      // old .catch() never saw a failed send - read the result instead.
      for (const ids of chunk(userIds, PUSH_BATCH)) {
        const { data: pushResult, error: pushError } = await adminClient.functions.invoke('send-push-notification', {
          body: { notifications: ids.map((id) => ({ userId: id, title: campaign.title, body: campaign.body })) },
        });
        if (pushError) {
          console.error(`promo campaign ${campaign.id}: push batch failed`, pushError);
        } else {
          pushesSent += pushResult?.sent ?? 0;
          pushesFailed += pushResult?.failed ?? 0;
        }
      }

      notificationsSent += userIds.length;

      const patch: Record<string, unknown> = { last_sent_at: now.toISOString() };
      if (campaign.frequency_days == null) patch.is_active = false;
      const { error: updateError } = await adminClient.from('promo_notification_campaigns').update(patch).eq('id', campaign.id);
      if (updateError) console.error(`promo campaign ${campaign.id}: could not update last_sent_at`, updateError);

      campaignsSent += 1;
    }

    console.log('promo run', JSON.stringify({ campaignsSent, notificationsSent, pushesSent, pushesFailed }));
    return jsonResponse({ success: true, campaignsSent, notificationsSent, pushesSent, pushesFailed });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
