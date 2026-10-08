// Supabase Edge Function - weekly nudge for any renter who hasn't
// uploaded their National/Gov ID verification document yet, repeating
// every week until they do. In-app notification only - no push, no
// email, matching what was actually asked for (see
// send-vendor-calendar-reminders' own precedent for "in-app + push only,
// no email - matches what was asked for"; here the ask was in-app only).
//
// national_id_status (on users) can't tell "never uploaded" apart from
// "uploaded, awaiting admin review" - both read 'pending' (see migration
// 0068_national_id.sql). The real signal is whether a documents row of
// type 'national_id' exists for that user (same check app/documents.js
// already makes client-side), so this fetches that table once and
// anti-joins in JS rather than trusting the status column alone.
//
// national_id_reminder_sent_at is a lookback-based guard (same idiom as
// vendors.calendar_reminder_sent_at), checked with a 6-day lookback so a
// weekly cron can't double-send within the same week but does fire again
// the following week.
//
// Scoped to role='renter' - vendors have their own, separate identity-
// verification flow (vendors.id_document_status/ghana_card_id), not this
// one.
//
// Further scoped to renters with at least one real booking (any row in
// bookings, any status) - narrowed from "every renter, ever" after the
// first live check found ~4,680 of ~4,700 renters (almost all pre-
// existing/dormant migrated accounts) had never uploaded an ID, which
// would have fired one giant one-time blast rather than a meaningful
// nudge. Checked by fetching bookings.renter_id into a Set rather than a
// `bookings!inner(id)` embedded join, which would return one duplicate
// user row per booking for a repeat renter. This is a plain per-run
// query, not a stored flag, so a brand-new renter automatically becomes
// eligible the moment their first booking exists - no separate handling
// needed for "future users".
//
// Deploy with: supabase functions deploy send-national-id-reminders --no-verify-jwt

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

    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();

    const { data: submittedDocs, error: docsError } = await adminClient
      .from('documents')
      .select('user_id')
      .eq('type', 'national_id');
    if (docsError) throw docsError;
    const submittedIds = new Set((submittedDocs ?? []).map((d) => d.user_id));

    const { data: renterBookings, error: bookingsError } = await adminClient.from('bookings').select('renter_id');
    if (bookingsError) throw bookingsError;
    const bookedRenterIds = new Set((renterBookings ?? []).map((b) => b.renter_id));

    const { data: candidates, error: usersError } = await adminClient
      .from('users')
      .select('id')
      .eq('role', 'renter')
      .or(`national_id_reminder_sent_at.is.null,national_id_reminder_sent_at.lt.${sixDaysAgo}`);
    if (usersError) throw usersError;

    const title = 'Upload your ID to keep booking';
    const body = 'Add your National ID or Ghana Card so you can complete bookings without delay.';

    let notified = 0;
    for (const candidate of candidates ?? []) {
      if (submittedIds.has(candidate.id)) continue;
      if (!bookedRenterIds.has(candidate.id)) continue;

      try {
        await adminClient.from('notifications').insert({
          user_id: candidate.id,
          type: 'national_id_reminder',
          title,
          body,
        });
      } catch {
        // Best-effort, same as every other reminder cron - one failed
        // insert must not stop the rest of this batch.
      }

      await adminClient.from('users').update({ national_id_reminder_sent_at: new Date().toISOString() }).eq('id', candidate.id);
      notified++;
    }

    return jsonResponse({ success: true, checked: (candidates ?? []).length, notified });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
