// Service worker: caches the whole app so it opens and works offline.
// VERSION is stamped by the GitHub workflow on every deploy, which makes the
// phone download the new files and show the "Nueva versión" banner.

const VERSION = "dev";
// Own prefix: never touches the caches of the original MyMeals on the same site.
const CACHE = `mymealsplus-${VERSION}`;
const ASSETS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "data/recipes.json",
  "icons/icon.svg",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "vendor/preact-htm.js",
  "js/ai/providers.js",
  "js/ai/run.js",
  "js/ai/secrets.js",
  "js/core/ai-recipes.js",
  "js/core/history.js",
  "js/core/suggest.js",
  "js/ui/ai-settings.js",
  "js/ui/ai-task.js",
  "js/ui/assistant.js",
  "js/ui/recipe-preview.js",
  "js/app.js",
  "js/store.js",
  "js/core/autofill.js",
  "js/core/dates.js",
  "js/core/parser.js",
  "js/core/planner.js",
  "js/core/shopping.js",
  "js/core/state.js",
  "js/ui/common.js",
  "js/ui/leftovers.js",
  "js/ui/meal-sheet.js",
  "js/ui/picker.js",
  "js/ui/prep.js",
  "js/ui/recipes.js",
  "js/ui/settings.js",
  "js/ui/sheets.js",
  "js/ui/slots.js",
  "js/ui/week.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((a) => new Request(a, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("mymealsplus-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache first: the app never needs the network once installed.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
