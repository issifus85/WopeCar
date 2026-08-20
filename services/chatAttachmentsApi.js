import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import supabase from './supabase';

const SIGNED_URL_TTL_SECONDS = 3600;

// Chat attachments live in the existing private `documents` bucket under
// documents/chat/<conversationId>/... (see migration 0066_chat_attachments -
// the storage RLS policies there are keyed on this exact path shape:
// [1]='chat', [2]=conversationId), not a new bucket - same "documents" is
// already the private, RLS-gated bucket for this kind of shared file, same
// upload pattern as uploadAvatar (services/supabaseAuthApi.js): fetch the
// local file:// URI into an arrayBuffer, no FormData/multipart.
async function uploadChatFile(conversationId, uri, extHint) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const arrayBuffer = await fetch(uri).then((res) => res.arrayBuffer());
  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(uri);
  const ext = (extMatch ? extMatch[1] : extHint || 'jpg').toLowerCase();
  const path = `chat/${conversationId}/${user.id}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from('documents').upload(path, arrayBuffer, {
    contentType: ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    upsert: true,
  });
  if (error) throw error;

  return path;
}

/**
 * `source: 'camera' | 'library'`. Returns null if the user cancels; throws
 * a friendly Error if permission is denied (caller decides how to surface
 * it - this service layer owns no UI).
 */
export async function pickAndUploadChatImage(conversationId, source) {
  const permission = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error(source === 'camera'
      ? 'Enable camera access in your device settings to take a photo.'
      : 'Enable photo library access in your device settings to attach a photo.');
  }

  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
  if (result.canceled || !result.assets?.[0]) return null;

  const path = await uploadChatFile(conversationId, result.assets[0].uri);
  return { type: 'image', url: path, meta: null };
}

/**
 * Any document type expo-document-picker's OS-level file browser exposes
 * (PDFs, images-as-files, Office docs, etc.) - no MIME allowlist, matching
 * how license/proof-of-address uploads elsewhere in the app don't
 * restrict beyond "the OS file picker showed it to you".
 */
export async function pickAndUploadChatDocument(conversationId) {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(asset.name || '');
  const path = await uploadChatFile(conversationId, asset.uri, extMatch ? extMatch[1] : undefined);
  return { type: 'document', url: path, meta: { filename: asset.name, size: asset.size ?? null } };
}

/**
 * No upload - a location message carries only lat/lng in attachment_meta,
 * never attachment_url. Same best-effort permission handling as the
 * inspection-photo GPS tag (app/inspection/photos.js), except here a
 * denial is the whole action failing (there's no "photo without location"
 * fallback the way inspection photos have), so it throws rather than
 * silently swallowing.
 */
export async function getCurrentLocationForChat() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('Enable location access in your device settings to share your location.');
  }
  const position = await Location.getCurrentPositionAsync({});
  return { type: 'location', url: null, meta: { lat: position.coords.latitude, lng: position.coords.longitude } };
}

/** Mirrors services/documentsApi.js's signedUrlFor() exactly - same private bucket, same TTL. */
export async function getChatAttachmentSignedUrl(filePath) {
  if (!filePath) return null;
  const { data } = await supabase.storage.from('documents').createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

/**
 * Opens a chat document attachment. Same "download to a local file, hand
 * it to the OS" flow services/quickbooksApi.js's downloadAndOpenPdf()
 * uses for invoice/receipt PDFs, minus the bearer-auth header - a Storage
 * signed URL is already pre-authorized, so a plain fetch is enough.
 */
export async function openChatDocument(signedUrl, filename) {
  if (Platform.OS === 'web') {
    const blob = await fetch(signedUrl).then((res) => res.blob());
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    return;
  }

  const buffer = await fetch(signedUrl).then((res) => res.arrayBuffer());
  const file = new File(Paths.cache, `${Date.now()}-${filename}`);
  file.create({ overwrite: true });
  file.write(new Uint8Array(buffer));

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri);
}
