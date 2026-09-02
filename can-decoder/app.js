// Точка входа: роутинг между экранами, общее состояние, localStorage.
// Экраны лежат в ui/ и ничего не знают друг о друге — связывает их только этот файл.

import { loadCatalog, isDevHost } from "./core/catalog.js";
import { j1939 } from "./protocols/j1939/index.js";

import * as frame from "./ui/frame.js";
import * as log from "./ui/log.js";
import * as reverse from "./ui/reverse.js";
import * as reference from "./ui/reference.js";
import * as cheatsheet from "./ui/cheatsheet.js";

// Порядок в массиве = порядок кнопок в таббаре. Первый экран — стартовый:
// открыл приложение, вставил кадр, увидел разбор.
const SCREENS = [frame, log, reverse, reference, cheatsheet];

// ==== Хранилище ====
// Всё под одним префиксом, чтобы не мешать другим приложениям на том же домене.
const PREFIX = "candec:";
const HISTORY_LIMIT = 20;

export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      // Приватный режим или битое значение — работаем без сохранения, но не падаем.
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* переполнение или запрет записи — молча продолжаем */
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* см. выше */
    }
  },
};

// История разобранных кадров: последние HISTORY_LIMIT, свежие сверху, без дублей.
export function pushHistory(entry) {
  const history = store.get("history", []).filter((h) => h.text !== entry.text);
  // Кадр набирают слева направо, поэтому недописанный вариант — это тот же кадр,
  // а не отдельная запись: заменяем его целиком.
  while (history.length && startsWith(entry.text, history[0].text)) history.shift();
  history.unshift({ ...entry, at: Date.now() });
  store.set("history", history.slice(0, HISTORY_LIMIT));
  return history;
}

function startsWith(text, prefix) {
  const clean = (value) => value.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  const full = clean(text);
  const start = clean(prefix);
  return start.length > 0 && full.startsWith(start);
}

export function getHistory() {
  return store.get("history", []);
}

export function toggleFavorite(pgn) {
  const favorites = store.get("favorites", []);
  const index = favorites.indexOf(pgn);
  if (index === -1) favorites.push(pgn);
  else favorites.splice(index, 1);
  store.set("favorites", favorites);
  return favorites;
}

export function getFavorites() {
  return store.get("favorites", []);
}

// ==== Роутинг ====
// Через hash, а не через кнопки-переключатели: в TWA системная кнопка «назад»
// должна возвращать на предыдущий экран, а не закрывать приложение.

const titleEl = document.getElementById("screen-title");
const tabbar = document.getElementById("tabbar");
const mounted = new Set();

function screenById(id) {
  return SCREENS.find((s) => s.meta.id === id) || null;
}

function currentId() {
  const fromHash = location.hash.replace(/^#\/?/, "");
  if (screenById(fromHash)) return fromHash;
  const saved = store.get("lastScreen");
  if (screenById(saved)) return saved;
  return SCREENS[0].meta.id;
}

export function go(id) {
  if (!screenById(id)) return;
  if (currentId() === id) render(id);
  location.hash = "#/" + id;
}

// Справочник грузим до первой отрисовки: без него экраны показывать нечего,
// а лежит он рядом и закэширован service worker'ом.
// Строгая проверка данных — только при разработке: на телефоне у пользователя
// падать из-за одной кривой строчки в справочнике нельзя.
let catalog = null;
let catalogError = null;
let faultCodes = [];
try {
  catalog = await loadCatalog(j1939.catalogUrl, { strict: isDevHost() });
} catch (error) {
  catalogError = error;
  console.error(error);
}
try {
  // Коды отказов нужны справочнику и разбору неисправностей; без них
  // остальное приложение работает, поэтому ошибку не поднимаем выше.
  const response = await fetch(j1939.faultCodesUrl);
  if (response.ok) faultCodes = (await response.json()).fmi || [];
} catch (error) {
  console.error(error);
}

const ctx = {
  store,
  go,
  pushHistory,
  getHistory,
  toggleFavorite,
  getFavorites,
  catalog,
  catalogError,
  faultCodes,
  protocol: j1939,
};

function render(id) {
  const screen = screenById(id);
  if (!screen) return;

  for (const s of SCREENS) {
    const el = document.getElementById("screen-" + s.meta.id);
    el.classList.toggle("hidden", s !== screen);
  }

  const root = document.getElementById("screen-" + id);
  if (!mounted.has(id)) {
    screen.mount(root, ctx);
    mounted.add(id);
  }
  screen.onShow?.(root, ctx);

  titleEl.textContent = screen.meta.title;
  document.title = screen.meta.title + " — CAN Дешифратор";

  for (const btn of tabbar.children) {
    btn.classList.toggle("active", btn.dataset.screen === id);
    btn.setAttribute("aria-current", btn.dataset.screen === id ? "page" : "false");
  }

  store.set("lastScreen", id);
  window.scrollTo(0, 0);
}

function buildTabbar() {
  tabbar.innerHTML = "";
  for (const s of SCREENS) {
    const btn = document.createElement("button");
    btn.className = "tab-btn";
    btn.type = "button";
    btn.dataset.screen = s.meta.id;
    btn.innerHTML =
      '<span class="tab-icon">' + s.meta.icon + "</span><span>" + s.meta.short + "</span>";
    btn.addEventListener("click", () => go(s.meta.id));
    tabbar.appendChild(btn);
  }
}

buildTabbar();
window.addEventListener("hashchange", () => render(currentId()));
render(currentId());

// ==== Офлайн ====
if ("serviceWorker" in navigator) {
  // Оболочка отдаётся из кэша, поэтому после обновления первая загрузка показывает
  // ещё старую версию, а новый воркер встаёт только следом. Чтобы человек не видел
  // вчерашнее приложение и не гадал, перезагружаем страницу один раз, когда
  // управление перешло к новому воркеру.
  // Первая в жизни установка тоже меняет управление, но там перезагружать нечего:
  // страница уже свежая. Поэтому смотрим, был ли воркер до неё.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });

  const register = () => navigator.serviceWorker.register("sw.js").catch(() => {});

  // Подписаться на «load» тут уже поздно: наверху модуля стоит await за справочником,
  // и к этой строке загрузка страницы обычно успевает закончиться. Подписка на
  // прошедшее событие не срабатывает никогда — офлайна не было бы, и молча.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register);
}
