// Real email delivery needs a backend endpoint plus a third-party provider
// (SendGrid, SES, Postmark, etc.) - neither exists in this project. This is
// the single, clearly-marked seam where that integration plugs in later;
// nothing above this function should need to change when it does.
export async function sendEmail({ to, subject, body }) {
  console.info(`[emailService] Would send email to ${to}: "${subject}" - ${body}`);
  return Promise.resolve();
}
