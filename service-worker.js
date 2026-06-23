const CACHE_NAME = "PopcornHUB";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icon.png"
];

// Install
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// Activate
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null))
    )
  );
});

// Fetch (network-first for APIs, cache fallback for static files)
self.addEventListener("fetch", event => {
  const url = event.request.url;

  // Don't cache API calls (important for TMDB/AniList)
  if (url.includes("api.themoviedb.org") || url.includes("anilist")) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
