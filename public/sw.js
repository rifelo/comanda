/*
 * Comanda app · service worker (scope "/").  docs/redesign/PLAN.md §4.
 *
 * Makes the app installable and gives it a friendly offline page. It never
 * caches pages with data: navigations go to the network, and only when that
 * fails it answers with the precached /offline page (no stale numbers, no
 * other person's session).
 *
 *   · /_next/static/*                        cache first (hashed, immutable)
 *   · icons, fonts, brand art, manifest.json,
 *     /_next/image                           stale-while-revalidate
 *   · navigations                            network only → /offline fallback
 *   · everything else                        not touched (falls through)
 *
 * Never touched: non-GET (server actions), /pos* (owned by pos-sw.js, scope
 * "/pos" — the longer scope wins, this is just belt and braces), /api/*,
 * /auth/*, RSC requests (`RSC: 1` header or `_rsc` param), other origins.
 * Caches are prefixed `app-` (the POS uses `pos-`); activate only prunes
 * old `app-*` caches.
 */
const VERSION = "v1";
const STATIC = `app-static-${VERSION}`;
const ASSETS = `app-assets-${VERSION}`;
const PAGES = `app-pages-${VERSION}`;
const KEEP = [STATIC, ASSETS, PAGES];
const OFFLINE_URL = "/offline";
const PRECACHE_ASSETS = ["/manifest.json", "/icons/icon.svg", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const pages = await caches.open(PAGES);
      await pages.add(new Request(OFFLINE_URL, { cache: "reload" }));
      const assets = await caches.open(ASSETS);
      await Promise.all(PRECACHE_ASSETS.map((u) => assets.add(u).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith("app-") && !KEEP.includes(k)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

const sameOrigin = (url) => url.origin === self.location.origin;
const under = (path, prefix) => path === prefix || path.startsWith(prefix + "/");

function ignored(request, url) {
  if (request.method !== "GET") return true;
  if (!sameOrigin(url)) return true;
  const p = url.pathname;
  if (under(p, "/pos") || p.startsWith("/pos-") || p === "/pos-sw.js") return true;
  if (under(p, "/api") || under(p, "/auth")) return true;
  if (p === "/sw.js") return true;
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return true;
  if (request.headers.get("Next-Router-Prefetch")) return true;
  return false;
}

const isStatic = (url) => url.pathname.startsWith("/_next/static/");
const isAsset = (url) =>
  url.pathname.startsWith("/_next/image") ||
  url.pathname === "/manifest.json" ||
  url.pathname.startsWith("/icons/") ||
  url.pathname.startsWith("/brand/") ||
  /\.(png|jpe?g|webp|svg|gif|ico|woff2?|otf|ttf)$/.test(url.pathname);

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(event.request);
  const refresh = fetch(event.request)
    .then((res) => {
      if (res.ok) cache.put(event.request, res.clone());
      return res;
    })
    .catch(() => undefined);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  const res = await refresh;
  return res || Response.error();
}

async function networkOnlyNavigation(event) {
  try {
    return await fetch(event.request);
  } catch {
    const offline = await caches.match(OFFLINE_URL, { cacheName: PAGES });
    return (
      offline ||
      new Response(
        "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Sin conexión</title>" +
          "<body style='font-family:system-ui;padding:40px;text-align:center'><h1>Sin conexión</h1>" +
          "<p>Revisa el wifi o los datos y vuelve a intentar.</p><p><a href=''>Reintentar</a></p>",
        { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
      )
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (ignored(request, url)) return;
  if (request.mode === "navigate") {
    event.respondWith(networkOnlyNavigation(event));
    return;
  }
  if (isStatic(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (isAsset(url)) {
    event.respondWith(staleWhileRevalidate(event));
  }
});
