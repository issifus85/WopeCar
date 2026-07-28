import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

// Dependency-free base64 -> bytes decode (RN/Hermes has no global atob) -
// only needed for the native data: URI branch of buildFilePart below.
function base64ToBytes(base64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    buffer = (buffer << 6) | chars.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

// uri is a local picker/camera URI (file:// on native, blob:/data: on web -
// re-fetched into a Blob first on web, same fix as authApi::uploadAvatar()).
// Signatures arrive as a data:image/png;base64 URI on both platforms (see
// components/SignaturePad.js) - RN's native FormData can't upload a data:
// URI directly (it needs a real file:// path the native layer can stream),
// so on native it's decoded and written out to a temp file first. web's
// fetch() resolves data:/blob: URIs into a Blob directly, no extra step.
//
// Shared between services/inspectionsApi.js and rentalAgreementApi.js -
// both upload signatures captured the exact same way via SignaturePad.
export async function buildFilePart(uri, filename) {
  if (Platform.OS === 'web') {
    const blob = await fetch(uri).then((res) => res.blob());
    return { blob, filename };
  }

  let fileUri = uri;
  if (uri.startsWith('data:')) {
    const tempFile = new File(Paths.cache, `${Date.now()}-${filename}`);
    tempFile.create();
    const base64 = uri.split(',')[1] ?? '';
    tempFile.write(base64ToBytes(base64));
    fileUri = tempFile.uri;
  }

  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(fileUri);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
  return { native: { uri: fileUri, name: filename, type: `image/${ext === 'jpg' ? 'jpeg' : ext}` } };
}
