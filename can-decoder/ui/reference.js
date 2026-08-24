// Экран «Справочник» — единый поиск по сообщениям, параметрам и кодам отказов.

import { buildIndex, search } from "../core/search.js";
import { range } from "../core/signal.js";
import { makeEntries, ENTRY } from "../protocols/j1939/entries.js";

export const meta = { id: "reference", title: "Справочник", short: "Справка", icon: "📚" };

const EXAMPLES = ["61444", "F004", "EEC1", "оборот", "SPN 190", "FMI 3"];

let context;
let index = [];
let field;
let results;
let details;

export function mount(root, ctx) {
  context = ctx;

  root.innerHTML =
    '<h2 class="screen-h2">Справочник</h2>' +
    '<div class="card">' +
      '<input id="ref-search" type="search" inputmode="search" autocomplete="off" ' +
        'spellcheck="false" placeholder="Номер PGN, SPN, код FMI или название" aria-label="Поиск по справочнику">' +
      '<div class="input-tools" id="ref-examples">' +
        EXAMPLES.map((q) => '<button type="button" class="chip mono" data-query="' + q + '">' + q + "</button>").join("") +
      "</div>" +
    "</div>" +
    '<div id="ref-details"></div>' +
    '<div id="ref-results"></div>';

  field = root.querySelector("#ref-search");
  results = root.querySelector("#ref-results");
  details = root.querySelector("#ref-details");

  if (!context.catalog) {
    results.innerHTML = card("Справочник не загрузился, поиск недоступен.");
    return;
  }

  index = buildIndex(makeEntries(context.catalog, context.faultCodes || []));

  field.addEventListener("input", () => render(field.value));
  root.querySelector("#ref-examples").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-query]");
    if (!button) return;
    field.value = button.dataset.query;
    render(field.value);
  });

  render(context.store.get("lastSearch", ""));
  if (field.value === "") field.value = context.store.get("lastSearch", "");
}

export function onShow() {
  // Возвращаясь на экран, показываем то же, что и было: механик листает туда-сюда.
  if (index.length) render(field.value);
}

// ==== Вывод ====

function render(query) {
  const text = String(query || "").trim();
  field.value = text;
  context.store.set("lastSearch", text);
  details.innerHTML = "";

  if (!text) {
    results.innerHTML = overview();
    wire();
    return;
  }

  const found = search(index, text);
  if (!found.length) {
    results.innerHTML = card(
      "По запросу «" + escape(text) + "» ничего не найдено. " +
        "Справочник содержит " + context.catalog.messages.length + " сообщений J1939 из открытых источников."
    );
    return;
  }

  results.innerHTML = groups(found);
  wire();
}

// Пустой запрос: показываем весь справочник, начиная с избранного.
function overview() {
  const favorites = context.getFavorites();
  const messages = context.catalog.messages;
  const chosen = messages.filter((m) => favorites.includes(m.pgn));
  const rest = messages.filter((m) => !favorites.includes(m.pgn));

  let html = "";
  if (chosen.length) {
    html += group("Избранное", chosen.map((message) => messageRow(message)));
  }
  html += group("Сообщения · " + rest.length, rest.map((message) => messageRow(message)));
  html += group(
    "Служебные · " + context.catalog.serviceMessages.length,
    context.catalog.serviceMessages.map((message) => messageRow(message))
  );
  html +=
    '<p class="disclaimer">Справочник собран из открытых источников и содержит ' +
    countText(messages.length, "сообщение", "сообщения", "сообщений") + " и " +
    countText(context.catalog.signals().length, "параметр", "параметра", "параметров") +
    ". Полный SAE J1939-71 в него не входит.</p>";
  return html;
}

function groups(found) {
  const byKind = { [ENTRY.MESSAGE]: [], [ENTRY.SIGNAL]: [], [ENTRY.FAULT]: [] };
  for (const entry of found) byKind[entry.kind].push(entry);

  let html = "";
  if (byKind[ENTRY.MESSAGE].length) {
    html += group("Сообщения", byKind[ENTRY.MESSAGE].map((entry) => messageRow(entry.data)));
  }
  if (byKind[ENTRY.SIGNAL].length) {
    html += group("Параметры", byKind[ENTRY.SIGNAL].map((entry) => signalRow(entry.data)));
  }
  if (byKind[ENTRY.FAULT].length) {
    html += group("Коды отказов", byKind[ENTRY.FAULT].map((entry) => faultRow(entry.data)));
  }
  return html;
}

function group(title, rows) {
  return '<div class="card"><div class="card-title">' + escape(title) + "</div>" + rows.join("") + "</div>";
}

function messageRow(message) {
  const favorites = context.getFavorites();
  const marked = favorites.includes(message.pgn);
  const rate = message.kind === "service" ? "служебное" : message.rate_ms ? message.rate_ms + " мс" : "по запросу";
  return (
    '<div class="ref-row">' +
      '<button type="button" class="ref-main" data-pgn="' + message.pgn + '">' +
        '<span class="ref-title">' +
          (message.acronym ? '<span class="acronym mono">' + escape(message.acronym) + "</span>" : "") +
          escape(message.name) +
        "</span>" +
        '<span class="ref-sub mono">PGN ' + message.pgn + " · " + escape(hexOf(message)) + " · " + rate + "</span>" +
      "</button>" +
      '<button type="button" class="ref-star' + (marked ? " on" : "") + '" data-star="' + message.pgn + '" ' +
        'aria-label="' + (marked ? "Убрать из избранного" : "В избранное") + '">' +
        (marked ? "★" : "☆") +
      "</button>" +
    "</div>"
  );
}

function signalRow(data) {
  const { message, signal } = data;
  const limits = safeRange(signal);
  return (
    '<div class="ref-row">' +
      '<button type="button" class="ref-main" data-pgn="' + message.pgn + '" data-spn="' + signal.spn + '">' +
        '<span class="ref-title">' + escape(signal.name) + "</span>" +
        '<span class="ref-sub mono">SPN ' + signal.spn + " · " + escape(message.acronym || message.name) +
          " · PGN " + message.pgn + (limits ? " · " + escape(limits) : "") + "</span>" +
      "</button>" +
    "</div>"
  );
}

function faultRow(fault) {
  return (
    '<div class="ref-row">' +
      '<div class="ref-main ref-static">' +
        '<span class="ref-title">FMI ' + fault.fmi + "</span>" +
        '<span class="ref-sub">' + escape(fault.description) + "</span>" +
      "</div>" +
    "</div>"
  );
}

// ==== Карточка сообщения ====

function showMessage(pgn, highlightSpn) {
  const message = context.catalog.find(pgn);
  if (!message) return;

  const rows = (message.signals || [])
    .map((signal) => {
      const limits = safeRange(signal);
      const values = signal.values
        ? '<div class="ref-values">' +
          Object.entries(signal.values)
            .map(([code, label]) => '<span class="mono">' + escape(code) + "</span> " + escape(label))
            .join("<br>") +
          "</div>"
        : "";
      return (
        '<div class="ref-row' + (signal.spn === highlightSpn ? " on" : "") + '">' +
          '<div class="ref-main ref-static">' +
            '<span class="ref-title">' + escape(signal.name) + "</span>" +
            '<span class="ref-sub mono">SPN ' + signal.spn + " · байт " + docPos(signal) +
              " · " + countText(signal.length_bits, "бит", "бита", "бит") +
              (signal.scale !== 1 ? " · масштаб " + signal.scale : "") +
              (signal.offset ? " · смещение " + signal.offset : "") +
              (limits ? " · " + escape(limits) : "") + "</span>" +
            values +
          "</div>" +
        "</div>"
      );
    })
    .join("");

  details.innerHTML =
    '<div class="card">' +
      '<button type="button" class="chip" data-close="1">← К поиску</button>' +
      '<p class="msg-title">' +
        (message.acronym ? '<span class="acronym mono">' + escape(message.acronym) + "</span> " : "") +
        "<strong>" + escape(message.name) + "</strong></p>" +
      '<div class="kv">' +
        '<div class="k">PGN</div><div class="v mono">' + message.pgn + " · " + escape(hexOf(message)) + "</div>" +
        '<div class="k">Длина</div><div class="v mono">' + (message.length || "—") + " байт</div>" +
        '<div class="k">Период</div><div class="v mono">' +
          (message.rate_ms ? message.rate_ms + " мс" : "по запросу") + "</div>" +
      "</div>" +
      (message.note ? '<p class="hint">' + escape(message.note) + "</p>" : "") +
    "</div>" +
    (rows ? '<div class="card"><div class="card-title">Параметры</div>' + rows + "</div>" : "");

  details.querySelector("[data-close]").addEventListener("click", () => {
    details.innerHTML = "";
    window.scrollTo(0, 0);
  });
  window.scrollTo(0, 0);
}

// ==== Обработчики ====

function wire() {
  results.querySelectorAll("button[data-pgn]").forEach((button) => {
    button.addEventListener("click", () => {
      const spn = button.dataset.spn ? Number(button.dataset.spn) : null;
      showMessage(Number(button.dataset.pgn), spn);
    });
  });

  results.querySelectorAll("button[data-star]").forEach((button) => {
    button.addEventListener("click", () => {
      context.toggleFavorite(Number(button.dataset.star));
      render(field.value);
    });
  });
}

// ==== Мелочи ====

function safeRange(signal) {
  if (signal.type === "enum") return ""; // у перечисления есть список значений, диапазон не нужен
  try {
    const limits = range(signal);
    const unit = signal.unit ? " " + signal.unit : "";
    return limits.min + "…" + limits.max + unit;
  } catch {
    return "";
  }
}

// Позиция в человеческом виде: «байт.бит» с единицы, как в документации.
function docPos(signal) {
  if (signal.doc_pos) return signal.doc_pos;
  return Math.floor(signal.start_bit / 8) + 1 + "." + ((signal.start_bit % 8) + 1);
}

function hexOf(message) {
  return message.pgn_hex || "0x" + message.pgn.toString(16).toUpperCase();
}

function countText(count, one, few, many) {
  const tens = count % 100;
  const units = count % 10;
  let word = many;
  if (units === 1 && tens !== 11) word = one;
  else if (units >= 2 && units <= 4 && (tens < 12 || tens > 14)) word = few;
  return count + " " + word;
}

function card(text) {
  return '<div class="card"><p class="hint">' + text + "</p></div>";
}

function escape(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
