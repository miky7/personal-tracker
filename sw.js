/* Libretto Personale: service worker.
   Pagina e file dell'app: prima la rete (così gli aggiornamenti arrivano subito), copia salvata se offline.
   Font Google: dalla copia salvata. Le chiamate a Supabase non passano di qui. */
const VERSION = 'libretto-v5';
const SHELL = [
  './', 'index.html', 'config.js', 'libretto-sync.js', 'vendor/supabase-2.117.3.js', 'manifest.json',
  'img/hero.jpg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await Promise.race([fetch(req), timeout(5000)]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return (await cache.match('index.html')) || (await cache.match('./'));
    throw e;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) { e.respondWith(networkFirst(req)); return; }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { e.respondWith(cacheFirst(req)); return; }
  // tutto il resto (Supabase compreso) va dritto in rete
});
