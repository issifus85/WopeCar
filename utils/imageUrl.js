// Car photos are legacy Laravel uploads (raw WhatsApp-camera JPEGs, 200KB-1.2MB
// each, no resizing/CDN on the origin - confirmed via curl, e.g. a single
// first-image came back at 1,185,630 bytes for a card rendered ~110x130).
// That's the real cause of "images loading slow the first time": nothing to
// do with expo-image's own disk cache (which is why it's fine on repeat
// visits), it's the network fetch of a multi-MB original on a small card.
//
// Routes the URL through images.weserv.nl (wsrv.nl), a free read-through
// image resizing/caching proxy - no account, no backend change. It fetches
// the origin once, resizes+re-encodes to webp, and edge-caches the result,
// so every app user after the first ever request for a given size gets the
// small cached version instead of the multi-MB original. Verified live: the
// 1.19MB sample above came back as 10.7KB at 220x260 webp.
const RESIZE_PROXY = 'https://wsrv.nl/';

/**
 * @param {string|null|undefined} url
 * @param {{ width: number, height?: number, quality?: number }} size
 */
export function resizeImageUrl(url, { width, height, quality = 75 } = {}) {
  if (!url || typeof url !== 'string') return url ?? null;
  if (!width) return url;
  // Already-proxied or non-http(s) sources (data:, local file:// etc.) pass
  // through untouched - re-wrapping would just add a hop for no benefit, or
  // outright fail for URIs the proxy can't fetch.
  if (url.startsWith(RESIZE_PROXY) || !/^https?:\/\//i.test(url)) return url;

  const params = new URLSearchParams({
    url,
    w: String(Math.round(width)),
    fit: 'cover',
    q: String(quality),
    output: 'webp',
  });
  if (height) params.set('h', String(Math.round(height)));

  return `${RESIZE_PROXY}?${params.toString()}`;
}

// A single generic neutral-gray blurhash shared by every car photo slot -
// not decoded from the actual image (the data layer has no per-photo hash
// stored), just something better than a blank white rectangle while the
// resized image is still loading in. The `blurhash:/` scheme is required -
// expo-image's isBlurhashString() only recognizes a plain hash string with
// this prefix; without it the string is treated as a literal image URI
// (confirmed live: a bare hash fired a network request for it as a path).
export const CAR_PHOTO_BLURHASH = 'blurhash:/LKO2?U%2Tw=w]~RBVZRi};RPxuwH';
