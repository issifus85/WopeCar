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

// Every call site multiplies its layout size by PixelRatio.get() before
// this ever sees it. iOS devices only ever report 2 or 3, so that was
// harmless there - but real Android hardware reports all sorts of
// in-between densities (2.625, 2.75, 3.5, ...), so the exact same 110x130
// card comes out to a different width on nearly every distinct Android
// device. Since that width becomes the cache key on wsrv.nl (a shared,
// public proxy cache - not per-device), each distinct width is its own
// cold cache entry that pays the full fetch-the-multi-MB-original-and-
// transform-it cost, instead of reusing a size some other tester's device
// already warmed - this is almost certainly why testers still see slow
// car photo loads on Android even after the whole prior optimization
// pass (034f0d2 and friends), which was verified on iOS Simulator/web and
// never against this kind of real Android density fragmentation.
//
// Rounds UP to the next proportional (20%) step rather than a fixed pixel
// amount, so it scales sensibly whether this is a ~36px avatar or a
// ~450px hero image without needing a separate constant per call site.
// Live-modeled against 110 * {2, 2.625, 2.75, 3, 3.5} (a realistic device
// spread): 5 distinct raw widths collapse to 3 shared cache keys, for a
// worst-case ~18% larger fetch than the exact size - a fair trade for
// turning most Android requests into an already-warm cache hit instead of
// a guaranteed-cold multi-MB origin fetch.
const SIZE_STEP_RATIO = 1.2;
function bucketSize(value) {
  return Math.round(Math.pow(SIZE_STEP_RATIO, Math.ceil(Math.log(value) / Math.log(SIZE_STEP_RATIO))));
}

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
    w: String(bucketSize(width)),
    fit: 'cover',
    q: String(quality),
    output: 'webp',
  });
  if (height) params.set('h', String(bucketSize(height)));

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
