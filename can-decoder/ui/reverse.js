// Экран «Обратный расчёт» — кадр по заданным значениям параметров.

import { composeMessage, hintFor } from "../core/compose.js";
import { bytesToHex } from "../core/frame.js";
import { escapeHtml } from "./result-view.js";

export const meta = { id: "reverse", title: "Обратный расчёт", short: "Обратно", icon: "🧮" };

let context;
let nodes = {};
let current = null; // выбранное сообщение

export function mount(root, ctx) {
  context = ctx;

  if (!ctx.catalog) {
    root.innerHTML = '<h2 class="screen-h2">Обратный расчёт</h2>' +
      '<div class="card"><p class="hint">Справочник не загрузился, собирать кадр не из чего.</p></div>';
    return;
  }

  const options = ctx.catalog.messages
    .map((m) => '<option value="' + m.pgn + '">' + escapeHtml((m.acronym ? m.acronym + " · " : "") + m.name) + "</option>")
    .join("");

  root.innerHTML =
    '<h2 class="screen-h2">Обратный расчёт</h2>' +
    '<div class="card">' +
      '<label class="field-label" for="rev-pgn">Сообщение</label>' +
      '<select id="rev-pgn"><option value="">— выберите —</option>' + options + "</select>" +
      '<div class="row2">' +
        '<div><label class="field-label" for="rev-priority">Приоритет</label>' +
          '<input id="rev-priority" class="mono" inputmode="numeric" value="6"></div>' +
        '<div><label class="field-label" for="rev-sa">Отправитель (SA)</label>' +
          '<input id="rev-sa" class="mono" inputmode="numeric" value="0"></div>' +
      "</div>" +
      '<div id="rev-da-row" class="hidden">' +
        '<label class="field-label" for="rev-da">Получатель (DA)</label>' +
        '<input id="rev-da" class="mono" inputmode="numeric" value="255">' +
      "</div>" +
    "</div>" +
    '<div id="rev-signals"></div>' +
    '<div id="rev-result"></div>';

  nodes = {
    select: root.querySelector("#rev-pgn"),
    priority: root.querySelector("#rev-priority"),
    sa: root.querySelector("#rev-sa"),
    daRow: root.querySelector("#rev-da-row"),
    da: root.querySelector("#rev-da"),
    signals: root.querySelector("#rev-signals"),
    result: root.querySelector("#rev-result"),
  };

  nodes.select.addEventListener("change", () =>selectMessage(nodes.select.value));
  [nodes.priority, nodes.sa, nodes.da].forEach((field) => field.addEventListener("input", update));

  const saved = ctx.store.get("lastReversePgn", "");
  if (saved && ctx.catalog.find(Number(saved))) {
    nodes.select.value = saved;
    selectMessage(saved);
  } else {
    nodes.signals.innerHTML = hint();
  }
}

// ==== Выбор сообщения ====

function selectMessage(value) {
  const pgn = Number(value);
  current = context.catalog.find(pgn) || null;
  context.store.set("lastReversePgn", value || "");

  if (!current) {
    nodes.signals.innerHTML = hint();
    nodes.result.innerHTML = "";
    nodes.daRow.classList.add("hidden");
    return;
  }

  // У адресуемых сообщений младший байт номера занят адресом получателя,
  // поэтому поле показываем только для них.
  nodes.daRow.classList.toggle("hidden", ((pgn >>> 8) & 0xff) >= 240);

  nodes.signals.innerHTML = signalsCard(current);
  nodes.signals.querySelectorAll("input, select").forEach((field) => {
    field.addEventListener("input", update);
    field.addEventListener("change", update);
  });
  update();
}

function signalsCard(message) {
  const rows = (message.signals || [])
    .map((signal) => {
      const id = "rev-spn-" + signal.spn;
      const field =
        signal.type === "enum" && signal.values
          ? '<select id="' + id + '" data-spn="' + signal.spn + '">' +
            '<option value="">FF — не задано</option>' +
            Object.entries(signal.values)
              .map(([code, label]) => '<option value="' + code + '">' + escapeHtml(code + " — " + label) + "</option>")
              .join("") +
            "</select>"
          : '<input id="' + id + '" data-spn="' + signal.spn + '" class="mono" inputmode="decimal" ' +
            'placeholder="' + placeholder(signal) + '">';

      return (
        '<div class="rev-row">' +
          '<label class="field-label" for="' + id + '">' + escapeHtml(signal.name) +
            ' <small class="mono">SPN ' + signal.spn + "</small></label>" +
          field +
        "</div>"
      );
    })
    .join("");

  return (
    '<div class="card">' +
      '<div class="card-title">Значения · ' + message.length + " байт</div>" +
      rows +
      '<p class="hint">Пустое поле означает, что байты параметра останутся FF — ' +
      "по стандарту это «данные недоступны».</p>" +
    "</div>"
  );
}

function placeholder(signal) {
  try {
    const hint = hintFor(signal);
    return hint.min + "…" + hint.max + (hint.unit ? " " + hint.unit : "");
  } catch {
    return "";
  }
}

// ==== Сборка кадра ====

function update() {
  if (!current) return;

  const values = new Map();
  nodes.signals.querySelectorAll("[data-spn]").forEach((field) => {
    const text = field.value.trim();
    if (text === "") return;
    const value = Number(text.replace(",", "."));
    values.set(Number(field.dataset.spn), Number.isFinite(value) ? value : NaN);
  });

  const { bytes, filled, problems } = composeMessage(current, values);

  let id;
  try {
    id = context.protocol.buildId({
      pgn: current.pgn,
      priority: clamp(nodes.priority.value, 0, 7, 6),
      sa: clamp(nodes.sa.value, 0, 255, 0),
      da: clamp(nodes.da.value, 0, 255, 255),
    });
  } catch (error) {
    nodes.result.innerHTML = problemCard(error.message);
    return;
  }

  const idHex = id.toString(16).toUpperCase().padStart(8, "0");
  const frameText = idHex + " " + bytesToHex(bytes);

  nodes.result.innerHTML =
    '<div class="card">' +
      '<div class="card-title">Кадр</div>' +
      '<div class="id-line mono">' + idHex + "</div>" +
      '<div class="frame-out mono">' + bytesToHex(bytes) + "</div>" +
      '<div class="input-tools">' +
        '<button type="button" class="chip" data-act="copy">Копировать</button>' +
        '<button type="button" class="chip" data-act="check">Проверить разбором</button>' +
      "</div>" +
    "</div>" +
    bytesCard(bytes, filled) +
    (problems.length ? problemCard(problems.map((p) => p.name + ": " + p.message).join("; ")) : "") +
    (filled.length
      ? ""
      : '<div class="card"><p class="hint">Ни одно значение не задано: кадр состоит из одних FF.</p></div>');

  nodes.result.querySelector('[data-act="copy"]').addEventListener("click", () => copy(frameText));
  nodes.result.querySelector('[data-act="check"]').addEventListener("click", () => {
    // Тот же кадр открывается на экране «Кадр»: прямой и обратный ход должны сойтись.
    context.store.set("lastFrame", frameText);
    context.go("frame");
  });
}

function bytesCard(bytes, filled) {
  const owners = new Map();
  filled.forEach((item, index) => {
    for (const byte of bytesOf(item.signal)) owners.set(byte, index);
  });

  const cells = Array.from(bytes, (value, index) => {
    const owner = owners.get(index);
    const dot = owner === undefined ? "" : '<i style="background:var(--sig-' + ((owner % 8) + 1) + ')"></i>';
    return (
      '<div class="byte' + (owner === undefined ? " byte-free" : "") + '">' +
        '<span class="byte-no">' + (index + 1) + "</span>" +
        '<span class="byte-hex mono">' + value.toString(16).toUpperCase().padStart(2, "0") + "</span>" +
        '<span class="byte-dots">' + dot + "</span>" +
      "</div>"
    );
  }).join("");

  const list = filled
    .map(
      (item, index) =>
        '<div class="sig-row"><span class="sig-dot" style="background:var(--sig-' + ((index % 8) + 1) + ')"></span>' +
        '<span class="sig-name">' + escapeHtml(item.name) + "<small>SPN " + item.spn + "</small></span>" +
        '<span class="sig-value">' + item.value + '<small class="mono">сырое ' + item.raw + "</small></span></div>"
    )
    .join("");

  return (
    '<div class="card">' +
      '<div class="bytes">' + cells + "</div>" +
      (list ? '<div class="sig-list">' + list + "</div>" : "") +
    "</div>"
  );
}

// ==== Мелочи ====

function bytesOf(signal) {
  const start = signal.start_bit;
  const end = start + signal.length_bits - 1;
  const list = [];
  for (let byte = start >> 3; byte <= end >> 3; byte++) list.push(byte);
  return list;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    flash("Кадр скопирован");
  } catch {
    flash("Скопировать не вышло: выделите строку вручную");
  }
}

function flash(text) {
  const note = document.createElement("p");
  note.className = "hint";
  note.textContent = text;
  nodes.result.querySelector(".card").appendChild(note);
  setTimeout(() => note.remove(), 2500);
}

function clamp(value, min, max, fallback) {
  const number = Number(String(value).trim());
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function problemCard(text) {
  return '<div class="card card-problem"><p class="problem-text">' + escapeHtml(text) + "</p></div>";
}

function hint() {
  return (
    '<div class="card">' +
      '<p class="lead">Выберите сообщение и задайте значения параметров.</p>' +
      '<p class="hint">Приложение соберёт кадр: незаполненные байты останутся FF. ' +
      "Готовый кадр можно скопировать или сразу проверить разбором на экране «Кадр».</p>" +
    "</div>"
  );
}
