// Supabase Edge Function - generates a real PDF for a submitted vehicle
// inspection (pre- or post-rental) and emails it to the renter, the
// vendor, and WopeCar Operations. Reverses 0012_vehicle_inspections.sql's
// own documented decision to skip PDF generation entirely - this is the
// first PDF-generation capability in either repo (no template to copy;
// the two existing "*-pdf" functions in wopecar-admin are pure proxies to
// PDFs QuickBooks itself already generated).
//
// Fires from a single mobile call site - app/inspection/signatures.js,
// right after submitInspection() flips status to 'submitted' - matching
// send-trip-completed's single-mobile-trigger shape, not the wopecar-admin
// calendar-* functions (which are called from both mobile and web admin).
//
// Idempotent: if report_pdf_path is already set, returns it unchanged
// rather than regenerating/re-emailing - a retried fire-and-forget call
// must not re-spam recipients.
//
// Deploy with: supabase functions deploy generate-inspection-report
// Reuses the same RESEND_API_KEY secret as every other email function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

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

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function emailShell(bodyHtml: string) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;padding:32px 16px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      <div style="background:#154B59;padding:28px 24px;text-align:center;">
        <img src="https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/logo-mark" alt="WopeCar" width="180" style="display:inline-block;height:auto;max-width:180px;" />
      </div>
      ${bodyHtml}
    </div>
  </div>`;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// String.fromCharCode(...bytes) blows the call stack on anything past a
// few tens of KB - this PDF embeds 15 photos + 2 signatures, easily into
// the hundreds of KB, so the base64 conversion has to be chunked.
function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function sendResendEmail(resendApiKey: string, payload: Record<string, unknown>) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Resend error: ${await res.text()}`);
}

// deno-lint-ignore no-explicit-any
function buildReportEmailHtml({ booking, car, vendorBusinessName, type, submittedAt }: any) {
  const body = `
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:20px;">
          <h1 style="font-size:20px;color:#154B59;margin:0 0 4px;">${type === 'post' ? 'Post-Rental' : 'Pre-Rental'} Inspection Report</h1>
          <p style="font-size:14px;color:#666666;margin:0;">${escapeHtml(car?.name ?? 'Your car')} — Booking ${escapeHtml(booking.booking_ref)}</p>
        </div>
        <p style="font-size:14px;color:#154B59;line-height:1.5;">Both parties have signed off on this inspection. The full report, including photos and signatures, is attached as a PDF.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px;">
          <tr><td style="padding:6px 0;color:#5b6b6c;">Vendor</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(vendorBusinessName ?? 'N/A')}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Submitted</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatDate(submittedAt)}</td></tr>
        </table>
      </div>
      <div style="background:#f5f5f5;padding:16px 24px;text-align:center;">
        <p style="font-size:12px;color:#999999;margin:0;">No action needed - this is just a record for your files.</p>
      </div>`;
  return emailShell(body);
}

// Mirrors app/inspection/interior.js's own SECTIONS exactly, so the PDF
// reads back the same human labels the wizard's checklist screen showed,
// not raw camelCase keys from the stored jsonb blob. Fixed/versioned
// checklist, not user data - safe to hardcode server-side.
const SECTIONS = [
  {
    title: 'Exterior & Lights',
    items: [
      { key: 'lightsOperational', label: 'All lights operational (headlights, brake, tail, indicators, hazard, reverse)' },
      { key: 'mirrorsGoodCondition', label: 'Mirrors (side & rearview) in good condition' },
      { key: 'windshieldClear', label: 'Windshield clear (no cracks or chips)' },
      { key: 'wipersFunctioning', label: 'Wipers & washer functioning' },
      { key: 'bodyConditionGood', label: 'Body condition (no major dents, rust, or scratches)' },
      { key: 'doorsLocksFunctioning', label: 'Doors & locks functioning properly' },
    ],
  },
  {
    title: 'Tyres & Safety',
    items: [
      { key: 'tyresGoodCondition', label: 'Tyres in good condition (no cracks, bulges, or uneven wear)' },
      { key: 'wheelAlignmentBalance', label: 'Wheel alignment & balance' },
      { key: 'seatBeltsFunctioning', label: 'Seat belts functioning' },
    ],
  },
  {
    title: 'Fluids & Engine',
    items: [
      { key: 'engineOilGood', label: 'Engine oil level & condition' },
      { key: 'brakeFluidGood', label: 'Brake fluid level' },
      { key: 'coolantLevelGood', label: 'Coolant level (no leaks)' },
    ],
  },
  {
    title: 'Interior & Function',
    items: [
      { key: 'noDashboardWarningLights', label: 'No dashboard warning lights (engine, ABS, airbag)' },
      { key: 'acFunctioning', label: 'Air conditioning functioning' },
    ],
  },
  {
    title: 'Safety Equipment',
    items: [
      { key: 'warningTriangles', label: '2 warning triangles' },
      { key: 'spareTire', label: 'Spare tyre' },
      { key: 'jack', label: 'Jack' },
      { key: 'spannerTools', label: 'Spanner / tools' },
      { key: 'fireExtinguisher', label: 'Fire extinguisher' },
    ],
  },
];

// Mirrors constants/inspectionPhotos.js's PHOTO_CATEGORIES exactly (WopeCar
// repo) - can't import it directly (separate Deno runtime/deploy), same
// duplication precedent as this file's own SECTIONS copy of interior.js's
// checklist above. Pre-expansion legacy angles ('back'/'left'/'right' -
// 'front'/'odometer' are unchanged) are never in this list; a legacy-only
// inspection just renders fewer tiles than a current 15-photo one.
const PHOTO_CATEGORIES: { title: string; angles: { key: string; label: string }[] }[] = [
  {
    title: 'Exterior',
    angles: [
      { key: 'front', label: 'Front' },
      { key: 'rear', label: 'Rear' },
      { key: 'driver_side', label: 'Driver Side' },
      { key: 'passenger_side', label: 'Passenger Side' },
      { key: 'windshield_front', label: 'Front Windshield' },
      { key: 'windshield_rear', label: 'Rear Windshield' },
    ],
  },
  {
    title: 'Doors & Panels',
    angles: [
      { key: 'door_driver_front', label: 'Driver Front Door' },
      { key: 'door_driver_rear', label: 'Driver Rear Door' },
      { key: 'door_passenger_front', label: 'Passenger Front Door' },
      { key: 'door_passenger_rear', label: 'Passenger Rear Door' },
    ],
  },
  {
    title: 'Under Hood & Boot',
    angles: [
      { key: 'engine_bay', label: 'Engine Bay' },
      { key: 'boot', label: 'Boot / Trunk' },
    ],
  },
  {
    title: 'Interior',
    angles: [
      { key: 'interior_front', label: 'Front Interior' },
      { key: 'interior_rear', label: 'Rear Interior' },
      { key: 'odometer', label: 'Odometer' },
    ],
  },
];

const BRAND = rgb(0.0824, 0.294, 0.349); // #154B59
const MUTED = rgb(0.55, 0.55, 0.55);
const BORDER = rgb(0.85, 0.85, 0.85);
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;

// deno-lint-ignore no-explicit-any
async function buildReportPdf(inspection: any, booking: any, adminClient: ReturnType<typeof createClient>) {
  const pdfDoc = await PDFDocument.create();
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function newPage() {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }

  function ensureSpace(height: number) {
    if (y - height < MARGIN) newPage();
  }

  function text(str: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; lineHeight?: number } = {}) {
    const size = opts.size ?? 10;
    const lh = opts.lineHeight ?? size + 6;
    ensureSpace(lh);
    page.drawText(str, { x: MARGIN + (opts.indent ?? 0), y: y - size, size, font: opts.bold ? helvBold : helv, color: opts.color ?? rgb(0.1, 0.1, 0.1) });
    y -= lh;
  }

  async function downloadBytes(path: string | null) {
    if (!path) return null;
    const { data, error } = await adminClient.storage.from('documents').download(path);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  }

  // ---- Page 1: Header + Trip Info + Checklist ----
  text('WopeCar Vehicle Inspection Report', { size: 18, bold: true, color: BRAND, lineHeight: 26 });
  text(inspection.type === 'post' ? 'Post-Rental Inspection' : 'Pre-Rental Inspection', { size: 12, bold: true });
  y -= 4;
  text(`Booking Ref: ${booking.booking_ref}`);
  text(`Car: ${booking.cars?.name ?? '—'}`);
  text(`Vendor: ${booking.vendors?.business_name ?? '—'}`);
  text(`Renter: ${booking.renter?.full_name ?? '—'}`);
  text(`Submitted: ${formatDate(inspection.submitted_at)}`);
  y -= 10;

  text('Trip Info', { size: 13, bold: true, color: BRAND, lineHeight: 20 });
  text(`Mileage: ${inspection.mileage != null ? `${inspection.mileage} km` : '—'}`);
  text(`Fuel Level: ${inspection.fuel_level || '—'}`);
  y -= 10;

  text('Vehicle Checklist', { size: 13, bold: true, color: BRAND, lineHeight: 20 });
  for (const section of SECTIONS) {
    text(section.title, { size: 10.5, bold: true, lineHeight: 16 });
    for (const item of section.items) {
      const checked = !!inspection.checklist?.[item.key];
      text(`${checked ? '[x]' : '[ ]'} ${item.label}`, { size: 9, indent: 10, lineHeight: 13 });
    }
    y -= 4;
  }
  if (inspection.checklist?.notes) {
    text('Notes', { size: 10.5, bold: true, lineHeight: 16 });
    text(String(inspection.checklist.notes), { size: 9, indent: 10 });
  }

  // ---- Page 2: Photos ----
  newPage();
  text('Photos', { size: 14, bold: true, color: BRAND, lineHeight: 22 });
  y -= 4;

  const photosByAngle: Record<string, { file_path: string } | undefined> = {};
  for (const p of inspection.vehicle_inspection_photos ?? []) photosByAngle[p.angle] = p;

  const cols = 3;
  const gap = 16;
  const colW = (PAGE_WIDTH - MARGIN * 2 - gap * (cols - 1)) / cols;
  const imgH = 110;
  const rowH = imgH + 30;

  for (const category of PHOTO_CATEGORIES) {
    ensureSpace(18);
    text(category.title, { size: 11, bold: true, color: BRAND, lineHeight: 16 });

    let rowY = y;
    for (let i = 0; i < category.angles.length; i++) {
      const col = i % cols;
      if (col === 0) {
        ensureSpace(rowH);
        rowY = y;
      }
      const x = MARGIN + col * (colW + gap);
      const angle = category.angles[i];
      page.drawText(angle.label, { x, y: rowY - 9, size: 9, font: helvBold, color: rgb(0.1, 0.1, 0.1) });
      const boxTop = rowY - 22;
      const boxBottom = boxTop - imgH;
      page.drawRectangle({ x, y: boxBottom, width: colW, height: imgH, borderColor: BORDER, borderWidth: 1 });

      const photo = photosByAngle[angle.key];
      let drew = false;
      if (photo) {
        const bytes = await downloadBytes(photo.file_path);
        if (bytes) {
          try {
            const img = await pdfDoc.embedJpg(bytes);
            const scaled = img.scaleToFit(colW - 8, imgH - 8);
            page.drawImage(img, { x: x + (colW - scaled.width) / 2, y: boxBottom + (imgH - scaled.height) / 2, width: scaled.width, height: scaled.height });
            drew = true;
          } catch { /* fall through to placeholder */ }
        }
      }
      if (!drew) {
        page.drawText('Photo not available', { x: x + 8, y: boxBottom + imgH / 2, size: 8, font: helv, color: MUTED });
      }

      if (col === cols - 1 || i === category.angles.length - 1) {
        y = boxBottom - 12;
      }
    }
    y -= 8;
  }

  // ---- Page 3: Damage Points ----
  newPage();
  text('Damage Points', { size: 14, bold: true, color: BRAND, lineHeight: 22 });
  y -= 4;
  const damagePoints = inspection.vehicle_inspection_damage_points ?? [];
  if (damagePoints.length === 0) {
    text('No damage reported.', { size: 10 });
  } else {
    // deno-lint-ignore no-explicit-any
    for (const d of damagePoints as any[]) {
      text(`${d.view} — ${d.damage_type}${d.note ? `: ${d.note}` : ''}`, { size: 10 });
      text(`(placed at ${Number(d.x_pct).toFixed(0)}%, ${Number(d.y_pct).toFixed(0)}%)`, { size: 8, indent: 10, color: MUTED });
    }
  }

  // ---- Page 4: Signatures - the real gap vs. the in-app report, which
  // only ever shows presence booleans, never the actual signature image.
  newPage();
  text('Signatures', { size: 14, bold: true, color: BRAND, lineHeight: 22 });
  y -= 6;

  async function drawSignature(label: string, path: string | null, x: number) {
    const boxW = 220;
    const boxH = 90;
    page.drawText(label, { x, y: y - 10, size: 10, font: helvBold, color: rgb(0.1, 0.1, 0.1) });
    const boxTop = y - 26;
    const boxBottom = boxTop - boxH;
    page.drawRectangle({ x, y: boxBottom, width: boxW, height: boxH, borderColor: BORDER, borderWidth: 1 });

    let drew = false;
    if (path) {
      const bytes = await downloadBytes(path);
      if (bytes) {
        try {
          const img = await pdfDoc.embedPng(bytes);
          const scaled = img.scaleToFit(boxW - 16, boxH - 16);
          page.drawImage(img, { x: x + (boxW - scaled.width) / 2, y: boxBottom + (boxH - scaled.height) / 2, width: scaled.width, height: scaled.height });
          drew = true;
        } catch { /* fall through */ }
      }
    }
    if (!drew) {
      page.drawText(path ? 'Signature not available' : 'Not provided', { x: x + 10, y: boxBottom + boxH / 2, size: 9, font: helv, color: MUTED });
    }
    return boxBottom;
  }

  const bottom1 = await drawSignature('Renter Signature', inspection.renter_signature_path, MARGIN);
  const bottom2 = await drawSignature('Host / Agent Signature', inspection.agent_signature_path, MARGIN + 260);
  y = Math.min(bottom1, bottom2) - 20;
  text(`Submitted: ${formatDate(inspection.submitted_at)}`, { size: 9, color: MUTED });

  return pdfDoc.save();
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

    const { inspectionId } = await req.json();
    if (!inspectionId) {
      return jsonResponse({ error: 'inspectionId is required.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) {
      return jsonResponse({ error: 'Invalid or expired session.' }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: inspection, error: inspectionError } = await adminClient
      .from('vehicle_inspections')
      .select('*, vehicle_inspection_photos(*), vehicle_inspection_damage_points(*)')
      .eq('id', inspectionId)
      .single();
    if (inspectionError || !inspection) {
      return jsonResponse({ error: 'Inspection not found.' }, 404);
    }

    const { data: booking, error: bookingError } = await adminClient
      .from('bookings')
      .select('id, booking_ref, renter_id, vendor_id, cars(name), vendors(business_name, user_id), renter:renter_id(full_name, email)')
      .eq('id', inspection.booking_id)
      .single();
    if (bookingError || !booking) {
      return jsonResponse({ error: 'Booking not found.' }, 404);
    }

    const { data: callerProfile } = await adminClient.from('users').select('role, is_support').eq('id', caller.id).maybeSingle();
    const isAdmin = callerProfile?.role === 'admin' || !!callerProfile?.is_support;
    const isRenter = booking.renter_id === caller.id;
    const isVendorOwner = booking.vendors?.user_id === caller.id;
    if (!isAdmin && !isRenter && !isVendorOwner) {
      return jsonResponse({ error: 'Not authorized to generate this inspection report.' }, 403);
    }

    // Idempotent - a retried fire-and-forget call must not regenerate the
    // PDF or re-send the email to every recipient a second time.
    if (inspection.status !== 'submitted') {
      return jsonResponse({ error: 'Inspection is not yet submitted.' }, 400);
    }
    if (inspection.report_pdf_path) {
      return jsonResponse({ success: true, reportPdfPath: inspection.report_pdf_path, note: 'Report already generated.' });
    }

    const pdfBytes = await buildReportPdf(inspection, booking, adminClient);

    const reportPdfPath = `inspections/${booking.id}/${inspection.type}/report.pdf`;
    const { error: uploadError } = await adminClient.storage
      .from('documents')
      .upload(reportPdfPath, pdfBytes, { contentType: 'application/pdf', upsert: true });
    if (uploadError) throw uploadError;

    const { error: updateError } = await adminClient
      .from('vehicle_inspections')
      .update({ report_pdf_path: reportPdfPath })
      .eq('id', inspectionId);
    if (updateError) throw updateError;

    // Email is best-effort on top of the already-persisted PDF - a Resend
    // failure here must not erase the work that already succeeded above.
    if (resendApiKey) {
      try {
        const [{ data: supportSetting }, { data: fleetOpsSetting }, { data: vendorOwner }] = await Promise.all([
          adminClient.from('app_settings').select('value').eq('key', 'support_email').maybeSingle(),
          adminClient.from('app_settings').select('value').eq('key', 'fleet_ops_email').maybeSingle(),
          booking.vendors?.user_id
            ? adminClient.from('users').select('email, full_name').eq('id', booking.vendors.user_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        const supportEmail = typeof supportSetting?.value === 'string' ? supportSetting.value : null;
        const fleetOpsEmail = typeof fleetOpsSetting?.value === 'string' ? fleetOpsSetting.value : null;

        const to = [booking.renter?.email, vendorOwner?.email].filter(Boolean) as string[];
        const bcc = [supportEmail, fleetOpsEmail].filter(Boolean) as string[];

        if (to.length > 0) {
          const pdfBase64 = bytesToBase64(pdfBytes);
          await sendResendEmail(resendApiKey, {
            from: 'WopeCar <bookings@wopecar.com>',
            to,
            ...(bcc.length > 0 ? { bcc } : {}),
            subject: `Vehicle Inspection Report - ${inspection.type === 'post' ? 'Post-Rental' : 'Pre-Rental'} - ${booking.booking_ref}`,
            html: buildReportEmailHtml({
              booking, car: booking.cars, vendorBusinessName: booking.vendors?.business_name,
              type: inspection.type, submittedAt: inspection.submitted_at,
            }),
            attachments: [{ filename: `WopeCar-Inspection-${inspection.type}-${booking.booking_ref}.pdf`, content: pdfBase64 }],
          });
        }
      } catch (e) {
        console.error('generate-inspection-report: email send failed', e);
      }
    }

    // Best-effort - PostgrestFilterBuilder is a thenable, not a real
    // Promise, so it has no .catch() of its own; a notification failure
    // must not fail the report generation that already succeeded above.
    try {
      const rows = [];
      if (booking.renter_id) {
        rows.push({
          user_id: booking.renter_id,
          type: 'inspection_report_ready',
          title: 'Inspection report ready',
          body: `Your ${inspection.type === 'post' ? 'post' : 'pre'}-rental inspection report for ${booking.cars?.name ?? 'your car'} is ready.`,
          booking_id: booking.id,
        });
      }
      if (booking.vendors?.user_id) {
        rows.push({
          user_id: booking.vendors.user_id,
          type: 'inspection_report_ready',
          title: 'Inspection report ready',
          body: `The ${inspection.type} inspection report for ${booking.cars?.name ?? 'the car'} is ready.`,
          booking_id: booking.id,
        });
      }
      if (rows.length) await adminClient.from('notifications').insert(rows);
    } catch { /* best-effort */ }

    return jsonResponse({ success: true, reportPdfPath });
  } catch (e) {
    console.error('generate-inspection-report error', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
