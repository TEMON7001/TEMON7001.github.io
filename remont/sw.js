// Приложение обязано работать без сети: в магазине связь ловит плохо, а список
// нужен именно там. Поэтому вся оболочка кэшируется сразу при установке,
// вместе со справочником расходов.
//
// Взято из can-decoder/sw.js: там уже исправлен офлайн-фолбэк, который в первой
// версии electro был написан как .catch(() => cached) — в эту ветку попадаешь
// только когда cached уже undefined, то есть офлайн отдавалась пустота.
//
// Номер в CACHE_NAME — это номер сборки. Он же руками дублируется в карточке
// приложения на корневой странице сайта; поднимать оба места одной правкой.
const CACHE_NAME = "remont-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./core/room.js",
  "./core/units.js",
  "./core/materials.js",
  "./core/plural.js",
  "./core/works.js",
  "./core/list.js",
  "./ui/room.js",
  "./ui/works.js",
  "./ui/list.js",
  "./ui/method.js",
  "./data/materials.json",
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

// Оболочка отдаётся из кэша сразу, остальное (тесты, будущие файлы) — сначала из сети:
// иначе при разработке страница месяцами живёт на старой версии файла и это не видно.
const PRECACHED = new Set(ASSETS.map((path) => new URL(path, self.registration.scope).pathname));

// При разработке отдавать оболочку из кэша нельзя: правка в файле не видна,
// пока не сбросишь кэш вручную. На localhost всё идёт из сети, кэш остаётся запасным.
const DEV = ["localhost", "127.0.0.1"].includes(self.location.hostname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const isShell = !DEV && PRECACHED.has(new URL(req.url).pathname);

  event.respondWith(
    (isShell ? fromCacheFirst(req) : fromNetworkFirst(req)).catch(() => fallback(req))
  );
});

function fromCacheFirst(req) {
  return caches.match(req).then((cached) => cached || fromNetworkFirst(req));
}

function fromNetworkFirst(req) {
  // Локальный сервер разработки не присылает заголовков кэширования, и Chrome решает
  // сам, сколько файл «свежий». В разработке это выглядит как «правка не применилась»,
  // поэтому там ходим в сеть принудительно.
  const request = DEV ? new Request(req.url, { cache: "reload" }) : req;
  return fetch(request)
    .then((response) => {
      if (response && response.ok && response.type === "basic") {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
      }
      return response;
    })
    .catch(() => caches.match(req).then((cached) => cached || Promise.reject(new Error("нет сети и нет кэша"))));
}

// Офлайн и в кэше пусто: для навигации отдаём оболочку, для остального — честную ошибку.
function fallback(req) {
  if (req.mode !== "navigate") return Response.error();
  return caches.match("./index.html").then((shell) => shell || Response.error());
}
