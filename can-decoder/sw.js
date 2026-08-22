// Приложение обязано полностью работать в поле без сети: механик стоит у машины,
// интернета нет. Поэтому кэшируем всю оболочку сразу при установке, включая JSON-справочники.
const CACHE_NAME = "can-decoder-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./ui/_stub.js",
  "./ui/frame.js",
  "./ui/log.js",
  "./ui/reverse.js",
  "./ui/reference.js",
  "./ui/cheatsheet.js",
  "./data/j1939-pgn.json",
  "./data/fmi.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((response) => {
          if (response && response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return response;
        })
        .catch(() => {
          // Офлайн и в кэше пусто: для навигации отдаём оболочку,
          // для остального — честную сетевую ошибку.
          if (req.mode !== "navigate") return Response.error();
          return caches.match("./index.html").then((shell) => shell || Response.error());
        });
    })
  );
});
