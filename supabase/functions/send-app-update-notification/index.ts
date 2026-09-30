// Supabase Edge Function - broadcasts an "update available" push + in-app
// notification to every user with a push token on the affected platform,
// fired by a Postgres trigger (see migration
// 0120_add_app_update_notification_trigger.sql) the moment an admin edits
// app_settings.latest_ios_version or latest_android_version to a new value.
// No polling cron, no guard column - the trigger's own WHEN clause already
// guarantees this only runs once per real version change.
//
// Body: { platform: 'ios' | 'android', version: string }
//
// The push's data.url points straight at the App Store/Play Store listing
// (app_settings.app_store_url/play_store_url) - tapping it opens the store
// directly via services/pushNotifications.js's openNotificationUrl(), which
// now routes any http(s) data.url through Linking.openURL instead of the
// in-app router (that function previously only ever received internal
// routes like '/booking/123').
//
// Deploy with: supabase functions deploy send-app-update-notification --no-verify-jwt

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { platform, version } = await req.json();
    if (platform !== 'ios' && platform !== 'android') {
      return jsonResponse({ error: `Unknown platform: ${platform}` }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const storeSettingKey = platform === 'ios' ? 'app_store_url' : 'play_store_url';
    const { data: storeSetting } = await adminClient.from('app_settings').select('value').eq('key', storeSettingKey).maybeSingle();
    const storeUrl = (storeSetting?.value as string) || null;
    const storeName = platform === 'ios' ? 'App Store' : 'Play Store';

    const { data: tokens, error } = await adminClient.from('push_tokens').select('user_id').eq('platform', platform);
    if (error) throw error;

    // A user can have multiple devices/tokens for the same platform -
    // send-push-notification fans a single {userId,...} entry out to every
    // token on file for that user already, so de-dupe here rather than
    // sending the same user's devices duplicate notifications.
    const userIds = [...new Set((tokens ?? []).map((t) => t.user_id).filter(Boolean))];

    const title = 'Update available';
    const body = `WopeCar ${version} is ready on the ${storeName}. Update now for the latest features and fixes.`;

    if (userIds.length > 0) {
      const notificationRows = userIds.map((userId) => ({
        user_id: userId,
        type: 'app_update_available',
        title,
        body,
      }));
      await adminClient.from('notifications').insert(notificationRows).catch(() => {});

      await adminClient.functions
        .invoke('send-push-notification', {
          body: {
            notifications: userIds.map((userId) => ({
              userId,
              title,
              body,
              data: storeUrl ? { url: storeUrl } : undefined,
            })),
          },
        })
        .catch(() => {});
    }

    return jsonResponse({ success: true, platform, version, notified: userIds.length });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
