/* PopcornHUB service worker — resilient, same-origin app caching. */
const CACHE_NAME = "PopcornHUB-v35-desktop-secret-click-fix";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icon.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cache each shell asset independently so one missing asset won't abort install.
    await Promise.all(APP_SHELL.map(async (asset) => {
      try { await cache.add(new Request(asset, { cache: "reload" })); }
      catch (error) { console.warn("PopcornHUB: app-shell asset not cached:", asset, error); }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("PopcornHUB-") && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never intercept third-party APIs, images, fonts, or player frames.
  if (url.origin !== self.location.origin) return;

  // Navigation: use network first, then cached app entry for offline launch.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put("./index.html", response.clone()).catch(() => {});
        }
        return response;
      } catch (_) {
        return (await caches.match(request)) || (await caches.match("./index.html")) ||
          new Response("<h1>PopcornHUB is offline</h1><p>Reconnect to the internet and try again.</p>", {
            status: 503, headers: { "Content-Type": "text/html; charset=utf-8" }
          });
      }
    })());
    return;
  }

  // App files: network first, with cached fallback when offline.
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (_) {
      const cached = await caches.match(request);
      if (cached) return cached;
      return new Response("Offline - this PopcornHUB resource is not cached yet.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }
  })());
});
