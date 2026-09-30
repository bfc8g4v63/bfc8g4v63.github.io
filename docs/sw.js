const CACHE = "good-days-github-v67";
self.addEventListener("install", (event) => event.waitUntil(
  caches.open(CACHE)
    .then((cache) => cache.addAll(["/", "/styles.css?v=1.2.67", "/app.js?v=1.2.67", "/e/app.js?v=1.2.67"]))
    .then(() => self.skipWaiting())
));
self.addEventListener("activate", (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
