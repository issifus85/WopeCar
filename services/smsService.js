// Real SMS delivery needs a backend endpoint plus a paid third-party
// provider (Twilio, Africa's Talking, etc.) - neither exists in this
// project. This is the single, clearly-marked seam where that integration
// plugs in later; nothing above this function should need to change when it
// does.
export async function sendSms({ to, body }) {
  console.info(`[smsService] Would send SMS to ${to}: ${body}`);
  return Promise.resolve();
}
