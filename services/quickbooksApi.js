// Downloads and opens a booking's QuickBooks invoice/receipt PDF. The
// PDF endpoints (quickbooks-invoice-pdf, quickbooks-receipt-pdf) are our
// own Edge Functions proxying QuickBooks' bearer-auth-only PDF URLs, so
// they need the caller's Supabase session attached as an Authorization
// header - unlike the Documents Hub's Storage signed URLs (services/
// documentsApi.js), which are bearer-free and can just be handed to
// Linking.openURL. That means the same "fetch with auth header, write to
// a local file, hand it to the OS" flow buildFilePart() (services/
// mediaUpload.js) already uses for uploads, run in reverse for a download.
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import supabase, { SUPABASE_URL } from './supabase';

const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

async function downloadAndOpenPdf(path, filename) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('You need to be signed in to view this.');

  const res = await fetch(`${FUNCTIONS_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || 'Could not load this PDF.');
  }

  if (Platform.OS === 'web') {
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    return;
  }

  const buffer = await res.arrayBuffer();
  const file = new File(Paths.cache, `${Date.now()}-${filename}`);
  file.create({ overwrite: true });
  file.write(new Uint8Array(buffer));

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
}

export function viewQuickbooksInvoice(bookingId) {
  return downloadAndOpenPdf(`quickbooks-invoice-pdf?bookingId=${bookingId}`, `WopeCar-Invoice-${bookingId}.pdf`);
}

export function viewQuickbooksReceipt(bookingId) {
  return downloadAndOpenPdf(`quickbooks-receipt-pdf?bookingId=${bookingId}`, `WopeCar-Receipt-${bookingId}.pdf`);
}
