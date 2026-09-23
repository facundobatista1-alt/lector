/* global __PRECACHE__, __REVISION__, Response, caches */
const PRECACHE = __PRECACHE__;
const REVISION = __REVISION__;
const SHELL = `lumbre-shell-${REVISION}`;
const paths = new Set(PRECACHE);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('lumbre-shell-') && key !== SHELL) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const path = new URL(request.url).pathname;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try { const response = await fetch(request); if (response.ok) return response; } catch { /* Offline shell below. */ }
      return (await (await caches.open(SHELL)).match('/index.html')) || Response.error();
    })());
    return;
  }
  if (paths.has(path)) {
    event.respondWith((async () => (await (await caches.open(SHELL)).match(path)) || fetch(request))());
    return;
  }
  if (path.startsWith('/runtime/') || path.startsWith('/models/kokoro/')) {
    event.respondWith((async () => (await caches.match(request)) || fetch(request))());
  }
});
