// Экран «Кадр» — стартовый. Вставил кадр, увидел параметры, ничего не выбирая заранее.

import { parseFrame } from "../core/frame.js";
import { resolve } from "../core/resolve.js";
import { renderResult, wireHighlight, escapeHtml as escape } from "./result-view.js";
import { faultNoticeCard } from "./contact.js";

export const meta = { id: "frame", title: "Разбор кадра", short: "Кадр", icon: "🔎" };

const EXAMPLE = "0CF00400 FF A5 A7 E0 2E FF FF FF";

let input;
let keypad;
let historyBox;
let output;
let context;
let saveTimer = null;

export function mount(root, ctx) {
  context = ctx;

  root.innerHTML =
    '<h2 class="screen-h2">Разбор кадра</h2>' +
    '<div class="card">' +
      '<div class="input-row">' +
        '<input id="frame-input" class="mono frame-input" inputmode="none" autocomplete="off" ' +
          'spellcheck="false" placeholder="' + EXAMPLE + '" aria-label="Кадр CAN">' +
        '<button type="button" class="icon-btn" data-act="clear" aria-label="Очистить">✕</button>' +
      "</div>" +
      '<div class="input-tools">' +
        '<button type="button" class="chip" data-act="paste">Вставить</button>' +
        '<button type="button" class="chip" data-act="example">Пример</button>' +
        '<button type="button" class="chip" data-act="keypad">Клавиатура</button>' +
      "</div>" +
      '<div class="keypad hidden" id="frame-keypad"></div>' +
      '<div class="history hidden" id="frame-history"></div>' +
    "</div>" +
    '<div id="frame-result"></div>';

  input = root.querySelector("#frame-input");
  keypad = root.querySelector("#frame-keypad");
  historyBox = root.querySelector("#frame-history");
  output = root.querySelector("#frame-result");

  buildKeypad();
  root.querySelector(".input-tools").addEventListener("click", onTool);
  root.querySelector('[data-act="clear"]').addEventListener("click", () => {
    setText("");
    input.focus();
  });

  input.addEventListener("input", () => render(true));
  input.addEventListener("focus", () => showKeypad(true));

  const saved = ctx.store.get("lastFrame", "");
  if (saved) input.value = saved;

  renderHistory();
  render(false);
}

export function onShow() {
  // На экран приходят и с обратного расчёта: там кадр кладут в хранилище
  // и переключают экран — значит поле надо перечитать.
  const saved = context.store.get("lastFrame", "");
  if (saved && saved !== input.value) {
    input.value = saved;
    render(false);
  }
  renderHistory();
}

// ==== Ввод ====

function onTool(event) {
  const button = event.target.closest("button[data-act]");
  if (!button) return;
  const act = button.dataset.act;

  if (act === "example") {
    setText(EXAMPLE);
  } else if (act === "keypad") {
    showKeypad(keypad.classList.contains("hidden"));
  } else if (act === "paste") {
    paste();
  }
}

async function paste() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) setText(text.trim());
  } catch {
    // Браузер не дал доступ к буферу — не беда, вставить можно долгим нажатием по полю.
    note("Доступ к буферу обмена не предоставлен. Используйте вставку долгим нажатием по полю ввода.");
  }
}

function setText(text) {
  input.value = text;
  render(true);
}

function showKeypad(show) {
  keypad.classList.toggle("hidden", !show);
}

function buildKeypad() {
  const keys = "0123456789ABCDEF".split("");
  let html = '<div class="keys">';
  for (const key of keys) {
    html += '<button type="button" class="key" data-key="' + key + '">' + key + "</button>";
  }
  html += "</div>" +
    '<div class="keys keys-wide">' +
      '<button type="button" class="key" data-key=" ">Пробел</button>' +
      '<button type="button" class="key" data-key="\\b">⌫</button>' +
      '<button type="button" class="key" data-key="">Очистить</button>' +
    "</div>";
  keypad.innerHTML = html;

  // Отменять touchstart нельзя: в Chrome на Android это отменяет и последующий клик,
  // и клавиатура перестаёт работать с телефона. Гасим только мышиное нажатие —
  // чтобы поле не теряло фокус на настольном браузере.
  keypad.addEventListener("mousedown", (event) => event.preventDefault());

  keypad.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-key]");
    if (!button) return;
    const key = button.dataset.key;
    if (key === "") input.value = "";
    else if (key === "\\b") input.value = input.value.slice(0, -1);
    else input.value += key;
    render(true);
    // Системная клавиатура при inputmode="none" не появляется, поэтому фокус
    // возвращаем безопасно: видно, куда идёт ввод.
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
}

// ==== История ====

function renderHistory() {
  const history = context.getHistory();
  if (!history.length) {
    historyBox.classList.add("hidden");
    return;
  }
  historyBox.classList.remove("hidden");
  historyBox.innerHTML =
    '<div class="history-title">Последние кадры</div>' +
    history
      .slice(0, 5)
      .map(
        (item) =>
          '<button type="button" class="history-item" data-frame="' + escape(item.text) + '">' +
          '<span class="hi-name">' + escape(item.label || "Кадр") + "</span>" +
          '<span class="hi-frame mono">' + escape(shorten(item.text)) + "</span>" +
          "</button>"
      )
      .join("");

  historyBox.querySelectorAll("button[data-frame]").forEach((button) => {
    button.addEventListener("click", () => setText(button.dataset.frame));
  });
}

// Сохраняем не каждое нажатие: пока человек набирает, кадр растёт слева направо,
// и в историю должна попасть только законченная строка.
function scheduleSave(text, label) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    context.pushHistory({ text, label });
    renderHistory();
  }, 1200);
}

// ==== Разбор и вывод ====

function render(fromUser) {
  const text = input.value.trim();
  if (fromUser) context.store.set("lastFrame", text);

  if (!text) {
    output.innerHTML = hint();
    return;
  }

  let frame;
  try {
    frame = parseFrame(text);
  } catch (error) {
    // Пока человек набирает, ругаться на каждую цифру незачем.
    output.innerHTML = text.replace(/[^0-9a-fA-F]/g, "").length < 3 ? hint() : problem(error.message);
    return;
  }

  if (!context.catalog) {
    output.innerHTML = problem(
      "Справочник не загрузился" + (context.catalogError ? ": " + context.catalogError.message : "")
    );
    return;
  }

  let result;
  try {
    result = resolve(frame, context.catalog, context.protocol);
  } catch (error) {
    output.innerHTML = problem(error.message);
    return;
  }

  output.innerHTML = renderResult(result) + faultNoticeCard(result.id.pgn, context.protocol);
  wireHighlight(output);

  if (frame.dlc > 0) {
    scheduleSave(text, describe(result));
  }
}

function hint() {
  return (
    '<div class="card">' +
      '<p class="lead">Введите кадр вручную или вставьте из буфера обмена.</p>' +
      '<p class="hint">Допустимые форматы записи: <span class="mono">18F00400FFFF8200</span>, ' +
      '<span class="mono">18F00400 FF FF 82 00</span>, <span class="mono">0x18F00400#FFFF8200</span>. ' +
      "Для разбора файлов лога предназначен экран «Лог».</p>" +
    "</div>"
  );
}

function problem(message) {
  return '<div class="card card-problem"><p class="problem-text">' + escape(message) + "</p></div>";
}

function note(message) {
  output.insertAdjacentHTML("afterbegin", problem(message));
}

// ==== Мелочи ====

// Подпись записи в истории. Один акроним не различает посылки: EEC1 приходит десятками
// в секунду с разными данными, поэтому под подписью показываем саму строку кадра.
function describe(result) {
  if (!result.message) return "PGN " + result.id.pgn;
  const name = result.message.acronym || result.message.name;
  return name + " · PGN " + result.id.pgn;
}

// Кадр целиком в узкую строку не помещается: оставляем идентификатор и начало данных.
function shorten(text) {
  const parts = text.trim().toUpperCase().replace(/[#]/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    // Слитная запись: режем по длине, иначе строка вылезет за карточку.
    return parts[0].length > 20 ? parts[0].slice(0, 20) + "…" : parts[0];
  }
  if (parts.length <= 4) return parts.join(" ");
  return parts.slice(0, 4).join(" ") + "…";
}
