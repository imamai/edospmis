// EDOSPMIS Phase 8 — PWA offline-shell caching (ARCHITECTURE.md §11).
//
// Scope, deliberately narrow: cache Next's own static build assets, and
// keep a last-known-good copy of exactly the two views ARCHITECTURE.md §11
// names as the offline scope — My Work and the Requests (case) list — so
// a spotty connection shows the last thing the user saw instead of a
// browser error. This is NOT offline data entry: every mutation still
// requires a live connection, and no API/RPC response is ever cached, so a
// stale procurement record is never mistaken for a live one.
const CACHE_VERSION = "edospmis-shell-v1";
const SHELL_ROUTES = ["/app/home", "/app/prs"];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Next's hashed build assets are immutable — safe to cache aggressively.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  // Network-first for the two shell routes, falling back to the last
  // successful load only when the network genuinely fails (offline).
  if (request.mode === "navigate" && SHELL_ROUTES.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch {
          const cached = await cache.match(request);
          return cached ?? Response.error();
        }
      })(),
    );
  }
});
