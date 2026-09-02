// Точка входа: общее состояние, роутинг между экранами, localStorage.
// Экраны лежат в ui/ и друг о друге не знают — связывает их только этот файл.
//
// Главное свойство приложения: размеры комнаты вводятся один раз и живут здесь.
// Никакой экран не хранит свою копию размеров и не пересчитывает геометрию сам.

import { computeRoom, DEFAULT_ROOM } from "./core/room.js";
import { DEFAULT_WORKS } from "./core/works.js";

import * as room from "./ui/room.js";
import * as works from "./ui/works.js";
import * as list from "./ui/list.js";
import * as method from "./ui/method.js";

// Порядок в массиве = порядок кнопок в таббаре и порядок прохождения:
// комната → работы → список. Первый экран стартовый.
const SCREENS = [room, works, list, method];

// ==== Хранилище ====
// Всё под одним префиксом, чтобы не мешать другим приложениям на том же домене.
const PREFIX = "remont:";

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
};

// ==== Состояние ====
// Комната переживает переключение вкладок и перезапуск приложения:
// вернувшийся человек видит свою комнату, а не значения по умолчанию.

const state = {
  room: { ...DEFAULT_ROOM, ...(store.get("room") || {}) },
  works: { ...DEFAULT_WORKS, ...(store.get("works") || {}) }, // что делаем со стенами, полом, потолком
  params: store.get("params", {}),                            // параметры материалов, только изменённые вручную
  prices: store.get("prices", {}), // цены по id позиции — T5
  bought: store.get("bought", {}), // отметки «куплено» — T5
};

let geometry = computeRoom(state.room);

/** Изменение размеров комнаты: пересчитать, сохранить, показать. */
export function updateRoom(patch) {
  Object.assign(state.room, patch);
  recompute();
  // В хранилище кладём разобранные числа, а не сырой текст поля: «5,» осмысленно
  // только пока человек не дописал, а на следующем запуске поле должно показать 5.
  for (const key of Object.keys(DEFAULT_ROOM)) state.room[key] = geometry[key];
  store.set("room", state.room);
}

/** Изменение выбранных работ: обои или краска, ламинат или плитка. */
export function updateWorks(patch) {
  Object.assign(state.works, patch);
  store.set("works", state.works);
  recompute();
}

/** Изменение параметра материала. Храним только то, что человек тронул руками:
    остальное берётся из справочника и меняется вместе с ним. */
export function updateParams(group, patch) {
  const current = state.params[group] || (state.params[group] = {});
  Object.assign(current, patch);
  store.set("params", state.params);
  recompute();
}

/**
 * Цена позиции. Пустое поле — это «цену ещё не знаю», поэтому значение стирается,
 * а не сохраняется нулём.
 *
 * Пересчёта экранов здесь нет намеренно: цена меняет только суммы на самом экране
 * «Список», а перерисовка во время набора уводила бы курсор из поля.
 */
export function updatePrice(id, value) {
  if (value === "") delete state.prices[id];
  else state.prices[id] = value;
  store.set("prices", state.prices);
}

/** Отметка «куплено». Тоже без пересчёта: список от неё не меняется. */
export function toggleBought(id, on) {
  if (on) state.bought[id] = true;
  else delete state.bought[id];
  store.set("bought", state.bought);
}

function recompute() {
  geometry = computeRoom(state.room);
  ctx.geometry = geometry;
  // Список пересчитывается сразу: кнопки «рассчитать» в приложении нет.
  for (const screen of mounted) stale.add(screen.meta.id);
  refresh(currentId());
}

// ==== Справочник ====
// Нормы расхода и фасовки лежат рядом и закэшированы service worker'ом.
// Без них считать нечего, но падать нельзя: показываем это на экранах.

let data = null;
let dataError = null;
try {
  const response = await fetch("./data/materials.json");
  if (!response.ok) throw new Error("HTTP " + response.status);
  data = await response.json();
} catch (error) {
  dataError = error;
  console.error("Справочник материалов не загрузился:", error);
}

// ==== Роутинг ====
// Через hash, а не переключением классов: в нативной обёртке аппаратная кнопка
// «назад» ходит по истории WebView, и переходы между вкладками должны в неё попадать.

const titleEl = document.getElementById("screen-title");
const tabbar = document.getElementById("tabbar");
const content = document.getElementById("content");
const mounted = new Set();
const stale = new Set();

function screenById(id) {
  return SCREENS.find((s) => s.meta.id === id) || null;
}

function idFromHash() {
  const fromHash = location.hash.replace(/^#\/?/, "");
  return screenById(fromHash) ? fromHash : null;
}

// Сохранённый экран подставляется только на холодном старте. Дальше адрес главнее:
// иначе кнопка «назад» меняет адрес, а экран остаётся прежним — в нативной обёртке
// это выглядит как зависшее приложение.
function currentId() {
  return idFromHash() || SCREENS[0].meta.id;
}

export function go(id) {
  if (!screenById(id)) return;
  location.hash = "#/" + id;
}

const ctx = {
  store,
  state,
  data,
  dataError,
  geometry,
  go,
  updateRoom,
  updateWorks,
  updateParams,
  updatePrice,
  toggleBought,
};

// ==== Отрисовка ====

for (const screen of SCREENS) {
  const section = document.createElement("section");
  section.className = "screen hidden";
  section.id = "screen-" + screen.meta.id;
  content.appendChild(section);
}

tabbar.innerHTML = SCREENS.map(
  (s) =>
    '<button class="tab-btn" data-tab="' + s.meta.id + '">' +
    '<span class="tab-icon">' + s.meta.icon + "</span>" +
    "<span>" + s.meta.short + "</span></button>"
).join("");

tabbar.addEventListener("click", (event) => {
  const button = event.target.closest(".tab-btn");
  if (button) go(button.dataset.tab);
});

function refresh(id) {
  const screen = screenById(id);
  if (!screen || !mounted.has(screen)) return;
  if (!stale.has(id)) return;
  stale.delete(id);
  if (screen.refresh) screen.refresh(ctx);
}

function render(id) {
  const screen = screenById(id);
  if (!screen) return;

  for (const s of SCREENS) {
    document.getElementById("screen-" + s.meta.id).classList.toggle("hidden", s !== screen);
  }
  for (const button of tabbar.querySelectorAll(".tab-btn")) {
    button.classList.toggle("active", button.dataset.tab === id);
  }

  titleEl.textContent = screen.meta.title;
  document.title = screen.meta.title + " — Ремонт комнаты";

  if (!mounted.has(screen)) {
    screen.mount(document.getElementById("screen-" + screen.meta.id), ctx);
    mounted.add(screen);
    stale.delete(id);
  } else {
    refresh(id);
  }

  store.set("lastScreen", id);
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", () => render(currentId()));

// Холодный старт: возвращаем человека на тот экран, где он был в прошлый раз,
// и сразу выставляем адрес — без записи в историю, чтобы на первом экране
// кнопка «назад» закрывала приложение, а не листала вкладки.
const saved = store.get("lastScreen");
const startId = idFromHash() || (screenById(saved) ? saved : SCREENS[0].meta.id);
history.replaceState(null, "", "#/" + startId);
render(startId);
