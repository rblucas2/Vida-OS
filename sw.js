/* Service worker — app shell offline para a suite Vida OS */
const VERSION = "vidaos-v26";
const CORE = [
  "./", "./index.html", "./dashboard.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-180.png",
  "./shared/base.css", "./shared/store.js", "./shared/sync.js",
  "./shared/ui.js", "./shared/domain.js", "./shared/gcal.js", "./shared/app.js",
  "./lifeos/", "./lifeos/index.html", "./lifeos/lifeos.js",
  "./finance/", "./finance/index.html", "./finance/finance.js",
  "./nutrition/", "./nutrition/index.html", "./nutrition/nutrition.js",
  "./gymos/", "./gymos/index.html",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => Promise.allSettled(CORE.map((u) => c.add(u)))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Não interferir com chamadas externas (Open Food Facts, Supabase)
  if (url.origin !== location.origin) return;

  // network-first para TUDO (mesma origem): sempre a versão mais recente quando há
  // internet; usa a cache apenas como fallback offline. cache:"no-store" ignora a
  // cache HTTP do próprio browser (o GitHub Pages envia Cache-Control com alguns
  // minutos de validade), garantindo que "no ar" significa mesmo "no ar já".
  e.respondWith(
    fetch(req, { cache: "no-store" }).then((r) => {
      if (r && r.ok) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); }
      return r;
    }).catch(() => caches.match(req).then((m) => m || (req.mode === "navigate" ? caches.match("./index.html") : Response.error())))
  );
});
