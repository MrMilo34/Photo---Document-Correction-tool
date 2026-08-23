const CACHE = 'docmesh-v0.7.0';
const CORE = [
  './',
  './index.html',
  './styles.css?v=0.7',
  './app.js?v=0.7',
  './manifest.webmanifest?v=0.7',
  './icons/icon-192.png?v=0.7',
  './icons/icon-512.png',
  './assets/home-splash.png?v=0.7'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const req = event.request;
  const isNavigation = req.mode === 'navigate';
  event.respondWith(
    fetch(req, { cache: 'no-store' })
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (isNavigation) return caches.match('./index.html');
        throw new Error('Offline and not cached');
      })
  );
});
