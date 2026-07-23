// Xpot service worker — offline shell for the installed PWA.
//
// Reps open this app in the field, often on a dead or one-bar connection. Without
// a worker, launching offline gives the browser's error page, which reads as
// "the app is broken / I got signed out". With it, the cached shell boots and the
// app's own retry state takes over.
//
// Rules of the road here:
//   • /api/* is NEVER cached — session, leads and sync must always hit the
//     network, and a stale /api/xpot/me would be exactly the bug this worker is
//     meant to help with.
//   • Navigations are network-first, so a deploy is picked up the moment the
//     device is online; the cached shell is only a fallback.
//   • /assets/* is cache-first — Vite fingerprints those filenames, so a given
//     URL's bytes never change.

const VERSION = "xpot-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const SHELL_URL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(new Request(SHELL_URL, { cache: "reload" })))
      // A failed precache must not block activation — the worker still works,
      // it just has no offline fallback until the first successful navigation.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Cross-origin (fonts, Supabase, storage) and the API stay untouched.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_URL, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(SHELL_URL);
          if (cached) return cached;
          return new Response("Offline", { status: 503, statusText: "Offline" });
        }),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
  }
});
