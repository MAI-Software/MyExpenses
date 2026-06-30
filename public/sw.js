// Service worker mínimo: precache del shell + cache-first para estáticos.
// Vite cambia los nombres con hash en cada build, así que cacheamos en runtime.
const CACHE = "myexpenses-v4";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const isNav = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");

  if (isNav) {
    // network-first: siempre intenta la versión nueva, cae a cache offline.
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }

  // Solo cacheamos recursos propios (same-origin). Lo de terceros (Google,
  // CDN de Tesseract) pasa directo a red, sin guardarse en nuestra caché.
  if (new URL(req.url).origin !== self.location.origin) return;

  // cache-first para assets propios (hasheados/inmutables).
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      });
    })
  );
});
