// Service worker de Estudia!: permite instalar la app y abrirla sin conexión.
// Estrategia: red primero para archivos propios (siempre la versión más nueva) y
// caché como respaldo. Nunca intercepta las llamadas a Supabase (datos y sesión).
const CACHE = 'estudia-v7';
const SHELL = [
  '/', '/app/', '/app/app.css', '/app/app.js', '/app/engine.js', '/app/store.js', '/app/data.js',
  '/config.js', '/landing.js', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match(url.pathname.startsWith('/app') ? '/app/' : '/'))),
  );
});
