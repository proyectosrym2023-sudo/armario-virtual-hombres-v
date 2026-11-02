// Service worker: app shell offline. Nunca cachea llamadas a Supabase/IA (privacidad y datos frescos).
const VERSION = 'avh-v1.0.0';
const SHELL = [
  './', './index.html', './styles.css', './config.js', './manifest.json',
  './js/app.js', './js/core.js', './js/db.js', './js/imagen.js', './js/nube.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];
const CDN = 'https://cdn.jsdelivr.net/';
// Librerías versionadas: se precargan para que el QR y el login funcionen sin haberlas usado antes con internet.
const LIBS = [
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(async c => {
    await c.addAll(SHELL);
    await Promise.allSettled(LIBS.map(u => c.add(new Request(u, { mode: 'cors' }))));
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Librerías versionadas del CDN (supabase-js, qrcode): cache-first, inmutables.
  if (req.url.startsWith(CDN)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') caches.open(VERSION).then(c => c.put(req, res.clone()));
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return; // Supabase, Hotmart, etc.: directo a la red

  // Navegación: red primero (para recibir actualizaciones), caché si no hay internet.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }
  // Estáticos propios: caché primero y refresco en segundo plano.
  e.respondWith(caches.match(req).then(cacheado => {
    const red = fetch(req).then(res => {
      if (res.ok) caches.open(VERSION).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => cacheado);
    return cacheado || red;
  }));
});
