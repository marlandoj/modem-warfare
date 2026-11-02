/* Modem Warfare — hand-written precache service worker.
 *
 * Rules of this file:
 *  - Everything the app needs is listed in PRECACHE and fetched exactly once,
 *    at install time. After that the shell is served cache-first and never
 *    touches the network for a precached URL.
 *  - Nothing outside app/ is precached: the dev harness (/dev/) and the
 *    ggwave spike (/spike/) are tools, not product.
 *  - The page can ask "are you really all cached?" over postMessage and gets
 *    a per-URL answer; the Home badge is driven by that, not by a flag.
 *
 * Bump VERSION whenever any precached file changes, so old caches are dropped.
 */

const VERSION = 'mw-tue-v1';
const CACHE = `modem-warfare-${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/frame.js',
  './js/fleet.js',
  './js/sha256.js',
  './js/audit.js',
  './js/audio.js',
  './js/qr.js',
  './js/scanner.js',
  './vendor/qrcode-generator.js',
  './vendor/zxing/zxing-reader.js',
  './vendor/zxing/zxing_reader.wasm',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

const PRECACHE_URLS = PRECACHE.map((p) => new URL(p, self.location.href).href);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // CSP already forbids this; be explicit.

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Navigations inside the app scope always get the cached shell
    // (query strings such as ?dev=A are ignored on purpose).
    if (req.mode === 'navigate') {
      const shell = await cache.match(new URL('./index.html', self.location.href).href, { ignoreSearch: true });
      if (shell) return shell;
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    // Not precached (dev harness, spike page, a stale asset): pass through.
    // When the radios are off this simply fails, which is the honest answer.
    return fetch(req);
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'CACHE_STATUS') return;
  const reply = (msg) => {
    if (event.ports && event.ports[0]) event.ports[0].postMessage(msg);
    else if (event.source) event.source.postMessage(msg);
  };
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const missing = [];
    for (const url of PRECACHE_URLS) {
      const hit = await cache.match(url, { ignoreSearch: true });
      if (!hit) missing.push(url.replace(self.registration.scope, './'));
    }
    reply({ type: 'CACHE_STATUS', version: VERSION, total: PRECACHE_URLS.length, cached: PRECACHE_URLS.length - missing.length, missing });
  })());
});
