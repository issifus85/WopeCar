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
};

function isDue(campaign: Campaign, now: Date, todayIso: string): boolean {
  if (campaign.starts_at > todayIso) return false;
  if (campaign.ends_at && campaign.ends_at < todayIso) return false;
  if (campaign.frequency_days == null) return !campaign.last_sent_at;
  if (!campaign.last_sent_at) return true;
  const nextDue = new Date(campaign.last_sent_at);
  nextDue.setDate(nextDue.getDate() + campaign.frequency_days);
  return nextDue <= now;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);

    const { data: campaigns, error } = await adminClient
      .from('promo_notification_campaigns')
      .select('id, title, body, target, frequency_days, starts_at, ends_at, last_sent_at')
      .eq('is_active', true);
    if (error) throw error;

    let campaignsSent = 0;
    let notificationsSent = 0;

    for (const campaign of (campaigns ?? []) as Campaign[]) {
      if (!isDue(campaign, now, todayIso)) continue;

      let usersQuery = adminClient.from('users').select('id');
      if (campaign.target !== 'all') usersQuery = usersQuery.eq('role', TARGET_ROLE[campaign.target]);
      const { data: users, error: usersError } = await usersQuery;
      if (usersError) {
        console.error(`promo campaign ${campaign.id}: could not resolve target users`, usersError);
        continue;
      }

      if (users?.length) {
        const rows = users.map((u) => ({ user_id: u.id, type: 'promo', title: campaign.title, body: campaign.body }));
        const { error: insertError } = await adminClient.from('notifications').insert(rows);
        if (insertError) console.error(`promo campaign ${campaign.id}: notification insert failed`, insertError);

        await adminClient.functions
          .invoke('send-push-notification', {
            body: { notifications: users.map((u) => ({ userId: u.id, title: campaign.title, body: campaign.body })) },
          })
          .catch((e) => console.error(`promo campaign ${campaign.id}: push send failed`, e));

        notificationsSent += users.length;
      }

      const patch: Record<string, unknown> = { last_sent_at: now.toISOString() };
      if (campaign.frequency_days == null) patch.is_active = false;
      const { error: updateError } = await adminClient.from('promo_notification_campaigns').update(patch).eq('id', campaign.id);
      if (updateError) console.error(`promo campaign ${campaign.id}: could not update last_sent_at`, updateError);

      campaignsSent += 1;
    }

    return jsonResponse({ success: true, campaignsSent, notificationsSent });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
