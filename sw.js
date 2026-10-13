// Musicum service worker: makes the site installable and quick to open from
// the home screen.
//
//   Pages            network first, falling back to the last copy seen
//   /_astro/ files   cache first (names carry a content hash)
//   fonts, icons     served from cache, refreshed in the background
//   everything else  straight to the network — audio streams from the CDN
//                    with range requests and is never cached here.

const VERSION = 'v1';
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const SCOPE = new URL(self.registration.scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PAGES).then((cache) => cache.add(SCOPE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== PAGES && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const path = url.pathname.slice(SCOPE.length);

  if (request.mode === 'navigate') return event.respondWith(page(request));
  if (path.startsWith('_astro/')) return event.respondWith(cacheFirst(request));
  if (path.startsWith('fonts/') || path.startsWith('icons/') || path === 'favicon.svg') {
    return event.respondWith(refreshing(request, event));
  }
});

async function page(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    return (await cache.match(request, { ignoreSearch: true })) || (await cache.match(SCOPE)) || Promise.reject(err);
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function refreshing(request, event) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  const fresh = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  if (hit) {
    event.waitUntil(fresh.catch(() => {}));
    return hit;
  }
  return fresh;
}
