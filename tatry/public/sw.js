// Service worker of the planner app: works without signal in the mountains.
// - the page itself (planer.html): the newest from the network when there is a connection (4 s at most),
//   the cached copy without signal; the trail network, the nature spots (discoveries on the trail work
//   without signal) and icons: cached, refreshed in the background
// - our offline map (offline/…webp): cache first; the "download for offline" button fills it
// - OpenTopoMap / OpenStreetMap tiles: the ones you have looked at stay in the cache (no bulk download,
//   their rules do not allow it), at most ~3000
const APP = 'tatry-app-v3', MAP = 'tatry-offline-map-v1', TILES = 'tatry-tiles-v1';
const APP_FILES = ['planer.html', 'manifest.webmanifest', 'data/region/trails.json', 'offline/index.json',
  'nature/spots.json', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => ![APP, MAP, TILES].includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || new Response('Brak połączenia', { status: 503 });
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await Promise.race([fetch(req, { cache: 'no-cache' }), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 4000))]);
    if (res.ok) { cache.put(req, res.clone()); return res; }
  } catch (err) { /* no signal or too slow */ }
  return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('planer.html')) || new Response('Brak połączenia', { status: 503 });
}

async function cacheFirst(req, cacheName, trim = 0) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') {
      await cache.put(req, res.clone());
      if (trim && Math.random() < 0.02) cache.keys().then((k) => { for (const r of k.slice(0, Math.max(0, k.length - trim))) cache.delete(r); });
    }
    return res;
  } catch (err) {
    return new Response('', { status: 504 });
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    const path = url.pathname;
    if (path.includes('/offline/') && path.endsWith('.webp')) { e.respondWith(cacheFirst(req, MAP)); return; }
    if (path.endsWith('/planer.html')) { e.respondWith(networkFirst(req, APP)); return; }
    if (APP_FILES.some((f) => path.endsWith('/' + f))) {
      e.respondWith(staleWhileRevalidate(req, APP)); return;
    }
    return;                          // the 3D view and its data: straight to the network
  }
  if (/tile\.opentopomap\.org|tile\.openstreetmap\.org/.test(url.hostname)) e.respondWith(cacheFirst(req, TILES, 3000));
});
