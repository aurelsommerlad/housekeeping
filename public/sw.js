/**
 * Service Worker fuer die Next.js-Housekeeping-App (Nachfolger des fruehen sw.js fuer die
 * statische index.html/app.js-Version). Next.js liefert Assets unter fingerprinteten, zur
 * Build-Zeit nicht bekannten Pfaden (/_next/static/...) - ein fest kodiertes App-Shell-Precache
 * wie zuvor ist damit nicht mehr sinnvoll moeglich. Stattdessen: Network-first mit Cache-Fallback
 * fuer jede same-origin GET-Anfrage, damit bereits besuchte Seiten/Assets offline nutzbar
 * bleiben (Briefing: "Offline-/Service-Worker-Verhalten soweit bisher implementiert" erhalten) -
 * ohne Annahmen ueber konkrete Dateinamen zu treffen. /api/* wird nie gecacht, da Housekeeping-
 * Daten immer live sein muessen.
 */
const CACHE = 'housekeeping-shell-v3';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      } catch (err) {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        throw err;
      }
    })
  );
});
