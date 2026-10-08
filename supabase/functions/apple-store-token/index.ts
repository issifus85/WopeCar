// Called by the app right after a successful native Sign in with Apple. Exchanges the one-time authorization
// code for Apple's refresh token and stores it (service role only) so delete-account can revoke it later
// (App Store rule 5.1.1(v)). Best effort: if the Apple secrets are not configured it does nothing.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { exchangeAppleCode, isAppleConfigured } from '../_shared/appleAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header.' }, 401);
    const { authorizationCode } = await req.json();
    if (!authorizationCode || typeof authorizationCode !== 'string') return json({ error: 'authorizationCode is required.' }, 400);
    if (!isAppleConfigured()) return json({ stored: false, reason: 'not_configured' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error } = await callerClient.auth.getUser();
    if (error || !user) return json({ error: 'Invalid or expired session.' }, 401);

    const providers: string[] = (user.app_metadata?.providers as string[] | undefined) ?? [];
    if (!providers.includes('apple')) return json({ stored: false, reason: 'not_an_apple_account' });

    const refreshToken = await exchangeAppleCode(authorizationCode);
    if (!refreshToken) return json({ stored: false, reason: 'exchange_failed' });

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error: upsertError } = await admin
      .from('apple_auth_tokens')
      .upsert({ user_id: user.id, refresh_token: refreshToken, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (upsertError) throw upsertError;
    return json({ stored: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
