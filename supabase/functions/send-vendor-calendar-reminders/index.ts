// Supabase Edge Function - weekly nudge (Mondays, see migration
// 0097_add_vendor_calendar_reminders_cron.sql) reminding every approved
// vendor with at least one car in their fleet to review and update that
// fleet's calendar availability for the coming week, with a CTA straight
// into the existing vendor calendar tab (app/vendor/(tabs)/calendar.js,
// reachable at /vendor/calendar - see app/vendor/bookings-guide.js for the
// same route string used elsewhere). Not a new availability feature, just a
// nudge toward the one that already exists - same posture as
// send-booking-ending-reminders' "extend booking" reminder.
//
// calendar_reminder_sent_at is a guard column (vendors table), same idiom
// as bookings.extend_reminder_sent_at / documents.expiry_notice_stage, but
// checked with a 6-day lookback rather than IS NULL: this is a recurring
// weekly reminder that should fire again every week, not a one-time-ever
// notice, so the guard only needs to prevent a double-send if the cron (or
// someone testing it) invokes this function twice in the same week.
//
// In-app + push only, no email - matches what was actually asked for,
// unlike send-booking-ending-reminders which also emails.
//
// Deploy with: supabase functions deploy send-vendor-calendar-reminders --no-verify-jwt

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();

    // Every approved vendor with at least one car (any status - the point
    // is to keep availability current for whenever a car is active/bookable,
    // not just the ones already live), not reminded in the last 6 days.
    const { data: vendors, error } = await adminClient
      .from('vendors')
      .select('id, user_id, business_name, cars!inner(id)')
      .eq('is_approved', true)
      .or(`calendar_reminder_sent_at.is.null,calendar_reminder_sent_at.lt.${sixDaysAgo}`);
    if (error) throw error;

    const title = 'Update your calendar';
    const body = 'A new week is starting - take a moment to review your fleet’s availability so renters see accurate dates.';

    let notified = 0;
    for (const vendor of vendors ?? []) {
      if (!vendor.user_id) continue;

      try {
        await adminClient.from('notifications').insert({
          user_id: vendor.user_id,
          type: 'vendor_calendar_reminder',
          title,
          body,
        });
      } catch {
        // Best-effort, same as every other reminder cron - one failed
        // insert must not stop the rest of this batch.
      }

      await adminClient.functions
        .invoke('send-push-notification', {
          body: {
            notifications: [
              { userId: vendor.user_id, title, body, data: { url: '/vendor/calendar' } },
            ],
          },
        })
        .catch(() => {});

      await adminClient.from('vendors').update({ calendar_reminder_sent_at: new Date().toISOString() }).eq('id', vendor.id);
      notified++;
    }

    return jsonResponse({ success: true, checked: (vendors ?? []).length, notified });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
