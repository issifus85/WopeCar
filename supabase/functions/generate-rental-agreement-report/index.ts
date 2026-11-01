// Supabase Edge Function - generates a PDF copy of a SUBMITTED client rental agreement, stores it, and emails it to the renter with WopeCar
// (support + fleet ops) in copy - so both the client and WopeCar hold a copy. Fires once from the app right after submitRentalAgreement()
// flips the agreement to 'submitted' (the admin completing it with the client, or the client doing it themselves).
//
// The vendor is NOT emailed: the agreement carries the client's details, and a vendor must never receive them (same rule as the inspection
// reports - see generate-inspection-report).
//
// Idempotent: if report_pdf_path is already set the existing path is returned and nothing is re-sent. The PDF is stored under
// system/agreements/<agreement id>/rental-agreement.pdf in the private `documents` bucket (migration 0162 lets the booking's renter read it).
//
// Deploy with: supabase functions deploy generate-rental-agreement-report
// Reuses the RESEND_API_KEY secret like every other email function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// Text mirrors components/ObligationsModal.js (and the original rental-agreement PDF) - the contract language.
const LESSOR_OBLIGATIONS = [
  'To grant the Lessee exclusive use and possession of the motor vehicle during the duration of this agreement, save as is provided for by the agreement;',
  'To grant the Lessee quiet possession of the motor vehicle, strictly self-driven;',
  'To keep the motor vehicle comprehensively insured with a reputable insurance company throughout the duration of this agreement;',
  'To provide the Lessee with the roadworthy document and sticker of the motor vehicle.',
];
const LESSEE_BASE = [
  'To ensure that the motor vehicle is used in a skillful and proper manner and only driven by the company driver;',
  'To be responsible for costs relating to fuel;',
  'To ensure the motor vehicle is not used for any fraudulent or criminal activity - if so used, the Lessee is solely responsible and liable by law during the period of rent;',
  'To ensure that the motor vehicle is not used for commercial reasons;',
];
const LESSEE_REST = [
  'To return the vehicle to the Lessor in good mechanical condition on expiration of the contract, in the same condition as was given - the Lessee must first contact the Lessor before making any changes to the car;',
  'The rate per day will increase if the Lessee decides to reduce the number of days instead of the initial duration agreed upon, or goes beyond the paid, selected destinations within Ghana stated in this contract;',
  'The vehicle will be repaired by the Lessee in case of any damage caused by the Lessee.',
];

function formatDate(value: string | null) {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function money(n: unknown) {
  return n === null || n === undefined || n === '' ? '—' : `GHS ${Number(n).toFixed(2)}`;
}

// String.fromCharCode(...bytes) blows the call stack on anything past a few tens of KB.
function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

// deno-lint-ignore no-explicit-any
async function buildPdf(agreement: any, booking: any, adminClient: any): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.082, 0.294, 0.349);
  const grey = rgb(0.36, 0.42, 0.44);
  const W = 595, H = 842, M = 48;
  let page = pdf.addPage([W, H]);
  let y = H - M;

  const ensure = (needed: number) => {
    if (y - needed < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const wrap = (text: string, f: typeof font, size: number, maxWidth: number) => {
    const lines: string[] = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        const test = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(test, size) > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  const paragraph = (text: string, opts: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) => {
    const size = opts.size ?? 10.5, f = opts.f ?? font, indent = opts.indent ?? 0;
    for (const line of wrap(text, f, size, W - 2 * M - indent)) {
      ensure(size + 4);
      page.drawText(line, { x: M + indent, y: y - size, size, font: f, color: opts.color ?? rgb(0.1, 0.14, 0.16) });
      y -= size + 4;
    }
    y -= opts.gap ?? 0;
  };
  const heading = (text: string) => {
    ensure(30);
    y -= 8;
    page.drawText(text, { x: M, y: y - 13, size: 13, font: bold, color: navy });
    y -= 20;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: rgb(0.85, 0.89, 0.9) });
    y -= 8;
  };
  // Long values (e.g. the destinations list) wrap within the value column instead of running off the page.
  const row = (label: string, value: string) => {
    const lines = wrap(String(value || '—'), bold, 10.5, W - 2 * M - 170);
    ensure(18 + (lines.length - 1) * 14);
    page.drawText(label, { x: M, y: y - 11, size: 10.5, font, color: grey });
    lines.forEach((line, i) => {
      page.drawText(line, { x: M + 170, y: y - 11 - i * 14, size: 10.5, font: bold, color: rgb(0.1, 0.14, 0.16) });
    });
    y -= 18 + (lines.length - 1) * 14;
  };

  page.drawText('WopeCar', { x: M, y: y - 20, size: 22, font: bold, color: navy });
  y -= 30;
  page.drawText('Vehicle Rental Agreement', { x: M, y: y - 14, size: 15, font: bold, color: rgb(0.1, 0.14, 0.16) });
  y -= 22;
  paragraph(`Booking ${booking.booking_ref}  -  submitted ${formatDate(agreement.submitted_at)}`, { size: 10, color: grey, gap: 4 });

  heading('Parties');
  row('Lessor', 'WopeCar');
  row('Lessee (Client)', agreement.lessee_name);

  heading('Vehicle');
  row('Registration number', agreement.vehicle_registration);
  row('Make / model', agreement.vehicle_make);
  row('Colour', agreement.vehicle_color);
  row('Year of manufacture', agreement.vehicle_year);

  heading('Rental terms');
  row('Pickup', `${formatDate(agreement.duration_start)}  ${agreement.pickup_time ?? ''}`.trim());
  row('Return', `${formatDate(agreement.duration_end)}  ${agreement.return_time ?? ''}`.trim());
  row('Daily rate', money(agreement.daily_rate));
  row('Security deposit', money(agreement.security_deposit));
  // The paid destination add-ons the renter selected at checkout (bookings.addon_names - the car's regional_addons).
  const destinations = (booking.addon_names ?? []).filter(Boolean) as string[];
  row('Paid destinations', destinations.length > 0 ? destinations.join(', ') : 'None selected');
  row('Used only within paid destinations', agreement.ghana_only_use === false ? 'Not agreed' : 'Agreed');

  heading("The Lessor's obligations");
  paragraph('The Lessor hereby agrees:', { gap: 2 });
  LESSOR_OBLIGATIONS.forEach((t, i) => paragraph(`${i + 1}.  ${t}`, { indent: 10, gap: 2 }));

  heading("The Lessee's obligations");
  paragraph('The Lessee hereby agrees:', { gap: 2 });
  const destinationList = destinations.length > 0 ? ` (${destinations.join(', ')})` : '';
  const ghana = `To ensure that the motor vehicle is only used within the paid, selected destinations within Ghana${destinationList} ${agreement.ghana_only_use === false ? '(not agreed)' : '(agreed)'};`;
  [...LESSEE_BASE, ghana, ...LESSEE_REST].forEach((t, i) => paragraph(`${i + 1}.  ${t}`, { indent: 10, gap: 2 }));

  heading('Signatures');
  const sigs = [
    { label: 'Lessee (Client)', path: agreement.client_signature_path },
    { label: 'WopeCar representative', path: agreement.representative_signature_path },
  ];
  ensure(130);
  let x = M;
  for (const sig of sigs) {
    page.drawText(sig.label, { x, y: y - 11, size: 10, font, color: grey });
    if (sig.path) {
      try {
        const { data } = await adminClient.storage.from('documents').download(sig.path);
        if (data) {
          const img = await pdf.embedPng(new Uint8Array(await data.arrayBuffer()));
          const scale = Math.min(210 / img.width, 80 / img.height);
          page.drawImage(img, { x, y: y - 20 - img.height * scale, width: img.width * scale, height: img.height * scale });
        }
      } catch {
        page.drawText('(signed)', { x, y: y - 40, size: 11, font: bold, color: navy });
      }
    }
    x += 260;
  }
  y -= 120;
  paragraph('This document is an electronic copy of the signed agreement held by WopeCar.', { size: 9, color: grey });

  return await pdf.save();
}

// deno-lint-ignore no-explicit-any
function buildEmailHtml(booking: any, agreement: any) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;padding:32px 16px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      <div style="background:#154B59;padding:28px 24px;text-align:center;">
        <img src="https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/logo-mark" alt="WopeCar" width="180" style="display:inline-block;height:auto;max-width:180px;" />
      </div>
      <div style="padding:28px 24px;">
        <p style="font-size:14px;color:#154B59;margin:0 0 4px;">Hi ${escapeHtml(booking.renter?.full_name || 'there')},</p>
        <p style="font-size:14px;color:#666666;line-height:1.6;margin:0 0 20px;">Your WopeCar rental agreement has been completed and signed. A PDF copy is attached for your records - WopeCar keeps a copy too, and you can also find it in the app under Documents &gt; Trip Documents.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px;">
          <tr><td style="padding:6px 0;color:#5b6b6c;">Booking Reference</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(booking.booking_ref)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Vehicle</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(agreement.vehicle_make || booking.cars?.name)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Rental period</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(formatDate(agreement.duration_start))} &rarr; ${escapeHtml(formatDate(agreement.duration_end))}</td></tr>
        </table>
      </div>
      <div style="background:#f5f5f5;padding:16px 24px;text-align:center;">
        <p style="font-size:12px;color:#999999;margin:0;">The WopeCar Team<br />support@wopecar.com | +233 551 478 540</p>
      </div>
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization header.' }, 401);

    const { agreementId } = await req.json();
    if (!agreementId) return jsonResponse({ error: 'agreementId is required.' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) return jsonResponse({ error: 'Invalid or expired session.' }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: agreement, error: agreementError } = await adminClient.from('rental_agreements').select('*').eq('id', agreementId).single();
    if (agreementError || !agreement) return jsonResponse({ error: 'Agreement not found.' }, 404);

    const { data: booking, error: bookingError } = await adminClient
      .from('bookings')
      .select('id, booking_ref, renter_id, addon_names, cars(name), renter:renter_id(full_name, email)')
      .eq('id', agreement.booking_id)
      .single();
    if (bookingError || !booking) return jsonResponse({ error: 'Booking not found.' }, 404);

    const { data: callerProfile } = await adminClient.from('users').select('role, is_support').eq('id', caller.id).maybeSingle();
    const isAdmin = callerProfile?.role === 'admin' || !!callerProfile?.is_support;
    if (!isAdmin && booking.renter_id !== caller.id) return jsonResponse({ error: 'Not authorized to generate this agreement copy.' }, 403);

    if (agreement.status !== 'submitted') return jsonResponse({ error: 'The agreement is not submitted yet.' }, 400);
    if (agreement.report_pdf_path) return jsonResponse({ success: true, reportPdfPath: agreement.report_pdf_path, note: 'Copy already generated.' });

    const pdfBytes = await buildPdf(agreement, booking, adminClient);
    const reportPdfPath = `system/agreements/${agreement.id}/rental-agreement.pdf`;
    const { error: uploadError } = await adminClient.storage.from('documents').upload(reportPdfPath, pdfBytes, { contentType: 'application/pdf', upsert: true });
    if (uploadError) throw uploadError;
    const { error: updateError } = await adminClient.from('rental_agreements').update({ report_pdf_path: reportPdfPath }).eq('id', agreement.id);
    if (updateError) throw updateError;

    // Email is best-effort on top of the already-stored PDF.
    if (resendApiKey) {
      try {
        const [{ data: supportSetting }, { data: fleetOpsSetting }] = await Promise.all([
          adminClient.from('app_settings').select('value').eq('key', 'support_email').maybeSingle(),
          adminClient.from('app_settings').select('value').eq('key', 'fleet_ops_email').maybeSingle(),
        ]);
        const supportEmail = typeof supportSetting?.value === 'string' ? supportSetting.value : null;
        const fleetOpsEmail = typeof fleetOpsSetting?.value === 'string' ? fleetOpsSetting.value : null;
        const to = [booking.renter?.email].filter(Boolean) as string[];
        const bcc = [supportEmail, fleetOpsEmail].filter(Boolean) as string[];
        if (to.length > 0) {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'WopeCar <bookings@wopecar.com>',
              to,
              ...(bcc.length > 0 ? { bcc } : {}),
              subject: `Your WopeCar Rental Agreement - ${booking.booking_ref}`,
              html: buildEmailHtml(booking, agreement),
              attachments: [{ filename: `WopeCar-Rental-Agreement-${booking.booking_ref}.pdf`, content: bytesToBase64(pdfBytes) }],
            }),
          });
          if (!res.ok) throw new Error(`Resend error: ${await res.text()}`);
        }
      } catch (e) {
        console.error('generate-rental-agreement-report: email send failed', e);
      }
    }

    // Best-effort in-app notification for the renter.
    try {
      if (booking.renter_id) {
        await adminClient.from('notifications').insert({
          user_id: booking.renter_id,
          type: 'rental_agreement_ready',
          title: 'Rental agreement ready',
          body: `Your rental agreement for ${booking.cars?.name ?? 'your car'} is complete. Find it under Documents > Trip Documents.`,
          booking_id: booking.id,
        });
      }
    } catch { /* best-effort */ }

    return jsonResponse({ success: true, reportPdfPath });
  } catch (e) {
    console.error('generate-rental-agreement-report error', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
