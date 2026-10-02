// Supabase Edge Function - sends a real Expo push notification to one or
// more users, using the tokens registered client-side by
// services/pushNotifications.js's registerPushToken() (stored in the new
// push_tokens table). This is what actually makes app/services/adminNotify.js's
// notifyUser() (and adminSettingsApi.js's broadcastNotification()) reach a
// user's device even when the app is closed or backgrounded - the
// `notifications` table row those write is only ever seen if/when the app
// is later opened; this is the missing "buzz your phone right now" half.
//
// Admin-only, same is_admin() gate as send-vendor-payout and friends -
// every current caller (adminNotify.js, adminSettingsApi.js's broadcast)
// is an admin action targeting some other user, so this deliberately does
// NOT support "send to yourself" self-service like send-notification-email.
//
// ALSO accepts a trusted internal call: any server-side function that
// authenticates with this project's own SUPABASE_SERVICE_ROLE_KEY (i.e.
// every cron-triggered reminder, and modify-booking's push-to-renter call).
// Confirmed via production logs (2026-08-31) that this was previously
// broken - a service-role-authenticated client has no real user session,
// so callerClient.auth.getUser() below returned an error and every such
// call 401'd silently (the call sites all wrap it in .catch(() => {}), so
// nothing surfaced this until it was investigated directly). Comparing the
// raw bearer token against this function's own service-role key is safe
// because that key is never shipped to any client (mobile app or admin
// web) - only other server-side Edge Functions ever hold it.
//
// Deploy with: supabase functions deploy send-push-notification

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

type NotificationInput = { userId: string; title: string; body?: string; data?: Record<string, unknown> };

// Expo caps a single push request at 100 messages - chunk defensively even
// though this app's real broadcast sizes are nowhere near that yet.
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
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

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const isTrustedInternalCall = authHeader.replace(/^Bearer\s+/i, '') === serviceRoleKey;
    if (!isTrustedInternalCall) {
      const callerClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: getUserError } = await callerClient.auth.getUser();
      if (getUserError || !user) {
        return jsonResponse({ error: 'Invalid or expired session.' }, 401);
      }

      const { data: callerProfile } = await adminClient.from('users').select('role').eq('id', user.id).maybeSingle();
      if (callerProfile?.role !== 'admin') {
        return jsonResponse({ error: 'Admin access required.' }, 403);
      }
    }

    const { notifications } = (await req.json()) as { notifications: NotificationInput[] };
    if (!Array.isArray(notifications) || notifications.length === 0) {
      return jsonResponse({ error: 'notifications (non-empty array) is required.' }, 400);
    }

    const userIds = [...new Set(notifications.map((n) => n.userId).filter(Boolean))];
    const { data: tokenRows, error: tokenError } = await adminClient
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', userIds);
    if (tokenError) throw tokenError;

    const tokensByUser = new Map<string, string[]>();
    (tokenRows ?? []).forEach((row) => {
      const list = tokensByUser.get(row.user_id) ?? [];
      list.push(row.token);
      tokensByUser.set(row.user_id, list);
    });

    // The number shown on the app icon. Every caller writes the in-app
    // `notifications` row before it calls this, so the unread count already
    // includes the one being sent (min 1 as a floor). The app corrects it to
    // its own full unread count (messages + notifications) when it opens.
    const unreadByUser = new Map<string, number>();
    await Promise.all([...tokensByUser.keys()].map(async (id) => {
      const { count } = await adminClient
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', id)
        .eq('is_read', false);
      unreadByUser.set(id, Math.max(1, count ?? 0));
    }));

    const messages = notifications.flatMap((n) =>
      (tokensByUser.get(n.userId) ?? []).map((token) => ({
        to: token,
        title: n.title,
        body: n.body ?? '',
        data: n.data ?? {},
        // sound: without it iOS delivers silently. priority + channelId:
        // Android only shows a heads-up banner for a HIGH-importance channel
        // (created by the app as 'alerts' - see services/pushNotifications.js).
        sound: 'default',
        badge: unreadByUser.get(n.userId) ?? 1,
        priority: 'high',
        channelId: 'alerts',
      }))
    );

    if (messages.length === 0) {
      // Normal, not an error - the recipient(s) just have no registered
      // device(s) (never opened the app on this build, denied permission,
      // etc). The in-app `notifications` row still exists for when they do.
      return jsonResponse({ success: true, sent: 0 });
    }

    // Expo answers HTTP 200 even when individual messages are rejected (bad
    // credentials, a token for an uninstalled app, ...), so the per-message
    // tickets have to be read - this used to count every 200 as "sent".
    let sent = 0;
    const failures: { token: string; error: string; message?: string }[] = [];
    for (const batch of chunk(messages, 100)) {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        batch.forEach((m) => failures.push({ token: m.to, error: `Expo HTTP ${res.status}` }));
        continue;
      }
      const json = await res.json().catch(() => null);
      const tickets: { status: string; message?: string; details?: { error?: string } }[] = json?.data ?? [];
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'ok') {
          sent += 1;
        } else {
          failures.push({ token: batch[i]?.to, error: ticket.details?.error ?? 'error', message: ticket.message });
        }
      });
    }

    // A token Expo says no longer maps to an installed app will never work
    // again - drop it so the next send doesn't keep paying for it.
    const dead = failures.filter((f) => f.error === 'DeviceNotRegistered').map((f) => f.token);
    if (dead.length > 0) await adminClient.from('push_tokens').delete().in('token', dead);
    if (failures.length > 0) console.error('send-push-notification failures', JSON.stringify(failures.slice(0, 20)));

    return jsonResponse({ success: true, sent, failed: failures.length, failures: failures.slice(0, 5) });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
