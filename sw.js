/* Public app shell only. Household data and attachments are never cached here. */
const CACHE = "household-organiser-ux-20261019-1";
const ROOT = new URL("./", self.location.href);
const FILES = [
  "./",
  "./index.html",
  "./events.js",
  "./calendar.js",
  "./tasks.js",
  "./sync.js",
  "./ui.js",
  "./updates.js",
  "./organiser.css",
  "./invitation.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
];
const PUBLIC = new Set(FILES.map((path) => new URL(path, ROOT).pathname));
self.addEventListener("install", (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES))),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  key.startsWith("household-organiser-") && key !== CACHE,
              )
              .map((key) => caches.delete(key)),
          ),
        ),
      self.clients.claim(),
    ]),
  ),
);
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const appFile = url.origin === ROOT.origin && PUBLIC.has(url.pathname);
  const sdk =
    url.origin === "https://www.gstatic.com" &&
    url.pathname.startsWith("/firebasejs/") &&
    url.pathname.endsWith(".js");
  if (event.request.method !== "GET" || (!appFile && !sdk)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE),
        key = appFile ? new URL(url.pathname, ROOT.origin).href : event.request;
      if (sdk) {
        const cached = await cache.match(key);
        if (cached) return cached;
      }
      try {
        // Avoid indefinitely hanging navigation on an unreliable connection.
        const response = await fetch(event.request, {
          ...(appFile ? { cache: "no-cache" } : {}),
          signal: AbortSignal.timeout(8000),
        });
        if (response.ok) await cache.put(key, response.clone());
        if (!response.ok && appFile) {
          const cached = await cache.match(key);
          if (cached) return cached;
        }
        return response;
      } catch (error) {
        const cached = await cache.match(key);
        if (cached) return cached;
        throw error;
      }
    })(),
  );
});
