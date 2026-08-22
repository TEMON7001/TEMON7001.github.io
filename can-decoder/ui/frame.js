// Экран «Кадр» — стартовый. Вставил кадр, увидел параметры, ничего не выбирая заранее.

import { parseFrame, bytesToHex } from "../core/frame.js";
import { resolve, KIND } from "../core/resolve.js";
import { STATE } from "../core/signal.js";

export const meta = { id: "frame", title: "Разбор кадра", short: "Кадр", icon: "🔎" };

const EXAMPLE = "0CF00400 FF A5 A7 E0 2E FF FF FF";
// Больше восьми цветов не нужно: в сообщении J1939 не бывает столько сигналов,
// чтобы соседние по байтам совпали по цвету.
const COLOR_COUNT = 8;

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
    note("Браузер не дал доступ к буферу обмена. Вставьте долгим нажатием по полю ввода.");
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
      '<button type="button" class="key" data-key=" ">пробел</button>' +
      '<button type="button" class="key" data-key="\\b">⌫</button>' +
      '<button type="button" class="key" data-key="">очистить</button>' +
    "</div>";
  keypad.innerHTML = html;

  // Не даём полю потерять фокус: иначе на телефоне каретка прыгает и клавиатура закрывается.
  keypad.addEventListener("mousedown", (event) => event.preventDefault());
  keypad.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });

  keypad.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-key]");
    if (!button) return;
    const key = button.dataset.key;
    if (key === "") input.value = "";
    else if (key === "\\b") input.value = input.value.slice(0, -1);
    else input.value += key;
    render(true);
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
      .slice(0, 8)
      .map(
        (item) =>
          '<button type="button" class="chip mono" data-frame="' + escape(item.text) + '">' +
          escape(item.label || item.text) +
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

  output.innerHTML =
    idCard(result) + messageCard(result) + signalsCard(result) + bytesCard(result) + skippedCard(result);
  wireHighlight();

  if (frame.dlc > 0) {
    scheduleSave(text, (result.message ? result.message.acronym || result.message.name : "PGN " + result.id.pgn));
  }
}

function hint() {
  return (
    '<div class="card">' +
      '<p class="lead">Вставьте кадр или наберите его на клавиатуре ниже.</p>' +
      '<p class="hint">Понимаются любые записи: <span class="mono">18F00400FFFF8200</span>, ' +
      '<span class="mono">18F00400 FF FF 82 00</span>, <span class="mono">0x18F00400#FFFF8200</span>. ' +
      "Строку целиком из лога разберёт экран «Лог».</p>" +
    "</div>"
  );
}

function problem(message) {
  return '<div class="card card-problem"><p class="problem-text">' + escape(message) + "</p></div>";
}

function note(message) {
  output.insertAdjacentHTML("afterbegin", problem(message));
}

function idCard(result) {
  const id = result.id;
  const rows = [
    ["PGN", id.pgn + " · " + id.pgnHex],
    ["Приоритет", String(id.priority)],
    ["Тип", id.pduFormat + (id.broadcast ? ", всем" : ", адресно")],
    ["Отправитель (SA)", id.sa + " · 0x" + hex2(id.sa)],
  ];
  if (id.da !== null) rows.push(["Получатель (DA)", id.da + " · 0x" + hex2(id.da)]);
  if (id.dp) rows.push(["Страница данных", String(id.dp)]);

  return (
    '<div class="card">' +
      '<div class="id-line mono">' + escape(id.idHex) + "</div>" +
      '<div class="kv">' +
        rows.map(([k, v]) => '<div class="k">' + k + '</div><div class="v mono">' + escape(v) + "</div>").join("") +
      "</div>" +
    "</div>"
  );
}

function messageCard(result) {
  if (result.kind === KIND.UNKNOWN) {
    return (
      '<div class="card card-unknown">' +
        "<p><strong>PGN не распознан</strong></p>" +
        '<p class="hint">Этого номера нет в справочнике, поэтому значений не показываем — ' +
        "выдумывать их нельзя. Сырые байты ниже.</p>" +
      "</div>"
    );
  }

  const message = result.message;
  const parts = [];
  if (message.acronym) parts.push('<span class="acronym mono">' + escape(message.acronym) + "</span>");
  parts.push("<strong>" + escape(message.name) + "</strong>");

  let extra = "";
  if (result.kind === KIND.SERVICE) {
    extra =
      '<p class="hint">Служебное сообщение: узнаём и подписываем, содержимое в MVP не разбираем.' +
      (message.note ? " " + escape(message.note) : "") +
      "</p>";
  } else {
    const bits = [];
    if (message.rate_ms) bits.push("период " + message.rate_ms + " мс");
    else bits.push("передаётся по запросу");
    bits.push(message.length + " байт");
    if (result.lengthMismatch) {
      bits.push(
        "<span class=\"warn\">в кадре " + result.lengthMismatch.got + "</span>"
      );
    }
    extra = '<p class="hint">' + bits.join(" · ") + "</p>";
  }

  return '<div class="card"><p class="msg-title">' + parts.join(" ") + "</p>" + extra + "</div>";
}

function signalsCard(result) {
  if (!result.signals.length) return "";

  const rows = result.signals
    .map((signal, index) => {
      const color = "var(--sig-" + ((index % COLOR_COUNT) + 1) + ")";
      return (
        '<button type="button" class="sig-row" data-spn="' + signal.spn + '">' +
          '<span class="sig-dot" style="background:' + color + '"></span>' +
          '<span class="sig-name">' + escape(signal.name) +
            '<small>SPN ' + signal.spn + "</small></span>" +
          '<span class="sig-value">' + valueHtml(signal) + "</span>" +
        "</button>"
      );
    })
    .join("");

  return '<div class="card"><div class="sig-list">' + rows + "</div></div>";
}

function valueHtml(signal) {
  if (signal.state === STATE.NOT_AVAILABLE) {
    return '<span class="dim">нет данных</span>';
  }
  if (signal.state === STATE.ERROR) {
    return '<span class="warn">ошибка датчика</span>';
  }

  if (signal.label !== null) {
    return escape(signal.label) + '<small class="mono">код ' + signal.raw + "</small>";
  }

  const shown = format(signal.value);
  const unit = signal.unit ? '<small>' + escape(signal.unit) + "</small>" : "";
  const out = '<span class="' + (signal.valid ? "" : "warn") + '">' + shown + "</span>" + unit;
  return signal.valid ? out : out + '<small class="warn">вне диапазона</small>';
}

function bytesCard(result) {
  const bytes = result.frame.bytes;
  if (!bytes.length) {
    return '<div class="card"><p class="hint">В кадре только идентификатор, данных нет.</p></div>';
  }

  const order = new Map();
  result.signals.forEach((signal, index) => order.set(signal.spn, index));

  const cells = Array.from(bytes, (value, index) => {
    const owners = result.byteOwners[index] || [];
    const dots = owners
      .map((spn) => {
        const color = "var(--sig-" + ((order.get(spn) % COLOR_COUNT) + 1) + ")";
        return '<i style="background:' + color + '"></i>';
      })
      .join("");
    return (
      '<button type="button" class="byte' + (owners.length ? "" : " byte-free") + '" ' +
        'data-owners="' + owners.join(",") + '">' +
        '<span class="byte-no">' + (index + 1) + "</span>" +
        '<span class="byte-hex mono">' + hex2(value) + "</span>" +
        '<span class="byte-dots">' + dots + "</span>" +
      "</button>"
    );
  }).join("");

  return (
    '<div class="card">' +
      '<div class="card-title">Байты <small>' + escape(bytesToHex(bytes)) + "</small></div>" +
      '<div class="bytes">' + cells + "</div>" +
      '<p class="hint">Нумерация байт как в документации J1939 — с единицы. ' +
      "Нажмите байт, чтобы увидеть его сигналы.</p>" +
    "</div>"
  );
}

function skippedCard(result) {
  if (!result.skipped.length) return "";
  const items = result.skipped
    .map((item) => "<li>" + escape(item.name) + " <small>SPN " + item.spn + "</small></li>")
    .join("");
  return (
    '<div class="card card-unknown">' +
      "<p><strong>Не поместились в кадр</strong></p>" +
      '<ul class="stub-list">' + items + "</ul>" +
      '<p class="hint">Кадр короче, чем сообщение в справочнике: эти сигналы разобрать не из чего.</p>' +
    "</div>"
  );
}

// Подсветка в обе стороны: нажали сигнал — видно его байты, нажали байт — видно его сигналы.
function wireHighlight() {
  const rows = output.querySelectorAll(".sig-row");
  const cells = output.querySelectorAll(".byte");

  const clear = () => {
    rows.forEach((row) => row.classList.remove("on"));
    cells.forEach((cell) => cell.classList.remove("on"));
  };

  rows.forEach((row) => {
    row.addEventListener("click", () => {
      const spn = row.dataset.spn;
      const active = row.classList.contains("on");
      clear();
      if (active) return;
      row.classList.add("on");
      cells.forEach((cell) => {
        if (cell.dataset.owners.split(",").includes(spn)) cell.classList.add("on");
      });
    });
  });

  cells.forEach((cell) => {
    cell.addEventListener("click", () => {
      const owners = cell.dataset.owners.split(",").filter(Boolean);
      const active = cell.classList.contains("on");
      clear();
      if (active || !owners.length) return;
      cell.classList.add("on");
      rows.forEach((row) => {
        if (owners.includes(row.dataset.spn)) row.classList.add("on");
      });
    });
  });
}

// ==== Мелочи ====

function format(value) {
  if (value === null) return "—";
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
}

function hex2(value) {
  return value.toString(16).toUpperCase().padStart(2, "0");
}

function escape(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
