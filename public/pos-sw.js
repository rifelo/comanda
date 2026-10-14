/*
 * comanda POS · service worker (scope /pos).
 *
 * Lets the register open and sell without internet. Orders themselves are not
 * handled here — they wait in the POS outbox (localStorage) and go out when
 * the connection is back. This worker only keeps what the page needs to load:
 *   · /pos (the HTML, with the catalog inside)  network first, cached copy offline
 *   · /_next/static/*  (hashed JS/CSS/fonts)    cache first
 *   · other same-origin GETs (icons, label art,
 *     /_next/image) + Supabase Storage images   stale-while-revalidate
 * POSTs (server actions) and everything else pass straight through.
 */
const VERSION = "v1";
const PAGES = `pos-pages-${VERSION}`;
const STATIC = `pos-static-${VERSION}`;
const ASSETS = `pos-assets-${VERSION}`;
const KEEP = [PAGES, STATIC, ASSETS];
const PAGE_KEY = "/pos";
const NAV_TIMEOUT_MS = 5000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith("pos-") && !KEEP.includes(k)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

const isPage = (url) => url.origin === self.location.origin && (url.pathname === "/pos" || url.pathname === "/pos/");
const isStatic = (url) => url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
const isStorage = (url) => url.hostname.endsWith(".supabase.co") && url.pathname.includes("/storage/v1/object/");
const isAsset = (url) =>
  isStorage(url) ||
  (url.origin === self.location.origin &&
    !url.pathname.startsWith("/api/") &&
    !url.searchParams.has("_rsc") &&
    (url.pathname.startsWith("/_next/image") || /\.(png|jpe?g|webp|svg|gif|ico|woff2?|otf|ttf|webmanifest|json)$/.test(url.pathname)));

/** A page response worth keeping: a real render, not a login redirect or an error. */
const goodPage = (res) => res && res.ok && !res.redirected && (res.headers.get("content-type") || "").includes("text/html");

async function pageFirstNetwork(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NAV_TIMEOUT_MS)),
    ]);
    if (goodPage(res)) await cache.put(PAGE_KEY, res.clone());
    return res;
  } catch {
    const hit = await cache.match(PAGE_KEY);
    if (hit) return hit;
    return new Response(
      "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Sin conexión</title>" +
        "<body style='font-family:system-ui;padding:40px;text-align:center'><h1>Sin conexión</h1>" +
        "<p>Esta caja todavía no tiene el punto de venta guardado para usarse sin internet.<br>" +
        "Conéctate una vez (por ejemplo, con los datos del celular) y recarga la página.</p>" +
        "<button onclick='location.reload()' style='font-size:18px;padding:10px 20px'>Reintentar</button></body>",
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
}

async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request, { ignoreVary: true });
  const fresh = fetch(request)
    .then(async (res) => {
      if (res.ok || res.type === "opaque") await cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) return hit;
  const res = await fresh;
  return res || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (request.mode === "navigate") {
    if (isPage(url)) event.respondWith(pageFirstNetwork(request));
    return;
  }
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;
  if (isStatic(url)) event.respondWith(cacheFirst(request, STATIC));
  else if (isAsset(url)) event.respondWith(staleWhileRevalidate(request, ASSETS));
});

/** The page sends what it already loaded before this worker was in control. */
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "cache" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      for (const raw of data.urls) {
        let url;
        try {
          url = new URL(raw, self.location.origin);
        } catch {
          continue;
        }
        try {
          if (isPage(url)) {
            const cache = await caches.open(PAGES);
            if (await cache.match(PAGE_KEY)) continue;
            const res = await fetch(url.pathname, { credentials: "same-origin" });
            if (goodPage(res)) await cache.put(PAGE_KEY, res);
          } else if (isStatic(url) || isAsset(url)) {
            const cache = await caches.open(isStatic(url) ? STATIC : ASSETS);
            if (await cache.match(url.href, { ignoreVary: true })) continue;
            const res = await fetch(url.href, isStorage(url) ? { mode: "no-cors" } : { credentials: "same-origin" });
            if (res.ok || res.type === "opaque") await cache.put(url.href, res);
          }
        } catch {
          /* offline or gone: the next visit tries again */
        }
      }
    })(),
  );
});
