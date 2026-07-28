import { Platform } from 'react-native';
import { request } from './api';

function normalizeDocument(raw) {
  return {
    id: raw.id,
    type: raw.type,
    status: raw.status,
    bookingId: raw.bookingId,
    signedUrl: raw.signedUrl,
    createdAt: raw.createdAt,
  };
}

/**
 * GET /api/documents - grouped for the Documents Hub's three sections.
 */
export async function getDocuments() {
  const json = await request('/documents', { auth: true });
  const data = json.data ?? {};
  return {
    verification: (data.verification ?? []).map(normalizeDocument),
    trip: (data.trip ?? []).map(normalizeDocument),
    vir: (data.vir ?? []).map(normalizeDocument),
  };
}

/**
 * POST /api/documents - re-upload a verification document from the Hub
 * directly (e.g. replacing an expired license photo), outside the
 * booking-creation flow. `type` is one of license_front/license_back/
 * proof_of_address; `uri` is a local picker URI (file:// on native, blob:/
 * data: on web - web URIs aren't directly appendable to FormData the way
 * native ones are, so they're re-fetched into a Blob first - same fix as
 * authApi.js::uploadAvatar()).
 */
export async function uploadDocument(type, uri) {
  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(uri);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
  const filename = `${type}.${ext}`;

  const body = new FormData();
  body.append('type', type);
  if (Platform.OS === 'web') {
    const blob = await fetch(uri).then((res) => res.blob());
    body.append('file', blob, filename);
  } else {
    body.append('file', { uri, name: filename, type: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
  }

  const json = await request('/documents', { method: 'POST', auth: true, body });
  return normalizeDocument(json.data);
}
