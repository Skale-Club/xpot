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
//   • A navigation fetch gets a hard deadline. iOS standalone WebViews are
//     notorious for fetches that never settle when the app resumes from a
//     snapshot; without the deadline respondWith() stays pending forever and
//     the rep stares at a frozen launch screen until they reinstall the app.
//   • /assets/* is cache-first — Vite fingerprints those filenames, so a given
//     URL's bytes never change.
//   • The shell's /assets/* files are precached from the shell HTML itself, so
//     the cached shell can always boot. Caching only the HTML (as v1 did) left
//     first-launch-offline pointing at scripts that were never cached — an
//     infinite loader.

const VERSION = "xpot-v2";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const SHELL_URL = "/";
const NAV_TIMEOUT_MS = 8000;

// fetch() with a deadline. Rejecting is essential: a pending respondWith blocks
// the navigation — and with it the page — indefinitely.
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("sw-fetch-timeout")), ms);
    fetch(request).then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// Cache the shell HTML plus every /assets/* file it references, so an offline
// launch has everything it needs to boot. Missing one asset is tolerated — the
// page-level boot watchdog (index.html) turns a partial cache into a retry
// screen instead of a hang.
async function precacheShell(shellResponse) {
  const response =
    shellResponse ??
    (await fetchWithTimeout(new Request(SHELL_URL, { cache: "reload" }), NAV_TIMEOUT_MS));
  if (!response.ok) return;

  const shellCache = await caches.open(SHELL_CACHE);
  await shellCache.put(SHELL_URL, response.clone());

  const html = await response.clone().text();
  const assetUrls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  const assetCache = await caches.open(ASSET_CACHE);
  await Promise.all(
    assetUrls.map(async (url) => {
      if (await assetCache.match(url)) return;
      try {
        const res = await fetch(url);
        if (res.ok) await assetCache.put(url, res);
      } catch {
        // Leave the gap; the watchdog covers a shell that can't fully boot.
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    precacheShell()
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
      fetchWithTimeout(request, NAV_TIMEOUT_MS)
        .then((response) => {
          if (response.ok) {
            // Refresh the shell and its asset precache in the background so the
            // offline fallback always matches the deploy that just responded.
            event.waitUntil(precacheShell(response.clone()).catch(() => undefined));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(SHELL_URL);
          if (cached) return cached;
          // Last resort: a self-retrying page, never a dead end.
          return new Response(
            `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="refresh" content="6"><title>Xpot</title></head><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0f1014;color:#e4e4e7;font-family:system-ui,sans-serif;text-align:center"><div><p style="margin:0 0 16px">You seem to be offline.<br>Retrying automatically…</p><button onclick="location.reload()" style="padding:10px 24px;border-radius:8px;border:0;background:#406EF1;color:#fff;font-size:15px">Try again</button></div></body></html>`,
            { status: 503, statusText: "Offline", headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
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
