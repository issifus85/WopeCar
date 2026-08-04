import supabase from './supabase';

// Real Resend delivery via the send-notification-email Edge Function -
// self-service, always sends to the caller's own email (see that
// function's header comment), so `to` is accepted for call-site parity
// with the old stub's signature but isn't actually forwarded; every current
// caller (contexts/InboxContext.js's notifyBookingEvent) already only ever
// passes the signed-in user's own address anyway.
export async function sendEmail({ subject, body }) {
  const { error } = await supabase.functions.invoke('send-notification-email', { body: { subject, body } });
  if (error) throw error;
}
