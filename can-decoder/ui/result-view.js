// Вывод разобранного кадра. Один и тот же вид нужен и на экране «Кадр»,
// и при разборе строки лога, поэтому разметка живёт отдельно от обоих экранов.

import { bytesToHex } from "../core/frame.js";
import { KIND } from "../core/resolve.js";
import { STATE } from "../core/signal.js";

// Больше восьми цветов не нужно: в сообщении J1939 не бывает столько сигналов,
// чтобы соседние по байтам совпали по цвету.
const COLOR_COUNT = 8;

/** Полная карточка разбора: идентификатор, сообщение, параметры, байты. */
export function renderResult(result, options = {}) {
  return (
    (options.skipId ? "" : idCard(result)) +
    messageCard(result) +
    signalsCard(result) +
    bytesCard(result) +
    skippedCard(result)
  );
}

export function idCard(result) {
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
      '<div class="id-line mono">' + escapeHtml(id.idHex) + "</div>" +
      '<div class="kv">' +
        rows.map(([k, v]) => '<div class="k">' + k + '</div><div class="v mono">' + escapeHtml(v) + "</div>").join("") +
      "</div>" +
    "</div>"
  );
}

export function messageCard(result) {
  if (result.kind === KIND.UNKNOWN) {
    return (
      '<div class="card card-unknown">' +
        "<p><strong>PGN не распознан</strong></p>" +
        '<p class="hint">Номер отсутствует в справочнике. Значения параметров не выводятся, ' +
        "ниже показаны байты кадра в исходном виде.</p>" +
      "</div>"
    );
  }

  const message = result.message;
  const parts = [];
  if (message.acronym) parts.push('<span class="acronym mono">' + escapeHtml(message.acronym) + "</span>");
  parts.push("<strong>" + escapeHtml(message.name) + "</strong>");

  let extra = "";
  if (result.kind === KIND.SERVICE) {
    extra =
      '<p class="hint">Служебное сообщение. Содержимое кадра не разбирается.' +
      (message.note ? " " + escapeHtml(message.note) : "") +
      "</p>";
  } else {
    const bits = [];
    bits.push(message.rate_ms ? "период " + message.rate_ms + " мс" : "передаётся по запросу");
    bits.push(message.length + " байт");
    if (result.lengthMismatch) bits.push('<span class="warn">в кадре ' + result.lengthMismatch.got + "</span>");
    extra = '<p class="hint">' + bits.join(" · ") + "</p>";
  }

  return '<div class="card"><p class="msg-title">' + parts.join(" ") + "</p>" + extra + "</div>";
}

export function signalsCard(result) {
  if (!result.signals.length) return "";

  const rows = result.signals
    .map((signal, index) => {
      const color = "var(--sig-" + ((index % COLOR_COUNT) + 1) + ")";
      return (
        '<button type="button" class="sig-row" data-spn="' + signal.spn + '">' +
          '<span class="sig-dot" style="background:' + color + '"></span>' +
          '<span class="sig-name">' + escapeHtml(signal.name) + "<small>SPN " + signal.spn + "</small></span>" +
          '<span class="sig-value">' + valueHtml(signal) + "</span>" +
        "</button>"
      );
    })
    .join("");

  return '<div class="card"><div class="sig-list">' + rows + "</div></div>";
}

export function valueHtml(signal) {
  if (signal.state === STATE.NOT_AVAILABLE) return '<span class="dim">данные недоступны</span>';
  if (signal.state === STATE.ERROR) return '<span class="warn">ошибка датчика</span>';

  if (signal.label !== null) {
    return escapeHtml(signal.label) + '<small class="mono">код ' + signal.raw + "</small>";
  }

  const shown = format(signal.value);
  const unit = signal.unit ? "<small>" + escapeHtml(signal.unit) + "</small>" : "";
  const out = '<span class="' + (signal.valid ? "" : "warn") + '">' + shown + "</span>" + unit;
  return signal.valid ? out : out + '<small class="warn">вне диапазона</small>';
}

export function bytesCard(result) {
  const bytes = result.frame.bytes;
  if (!bytes.length) {
    return '<div class="card"><p class="hint">Кадр содержит только идентификатор, байты данных отсутствуют.</p></div>';
  }

  const order = new Map();
  result.signals.forEach((signal, index) => order.set(signal.spn, index));

  const cells = Array.from(bytes, (value, index) => {
    const owners = result.byteOwners[index] || [];
    const dots = owners
      .map((spn) => '<i style="background:var(--sig-' + ((order.get(spn) % COLOR_COUNT) + 1) + ')"></i>')
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
      '<div class="card-title">Байты <small>' + escapeHtml(bytesToHex(bytes)) + "</small></div>" +
      '<div class="bytes">' + cells + "</div>" +
      '<p class="hint">Нумерация байтов по документации J1939, с единицы. ' +
      "Нажатие на байт выделяет связанные параметры.</p>" +
    "</div>"
  );
}

export function skippedCard(result) {
  if (!result.skipped.length) return "";
  const items = result.skipped
    .map((item) => "<li>" + escapeHtml(item.name) + " <small>SPN " + item.spn + "</small></li>")
    .join("");
  return (
    '<div class="card card-unknown">' +
      "<p><strong>Параметры вне длины кадра</strong></p>" +
      '<ul class="stub-list">' + items + "</ul>" +
      '<p class="hint">Кадр короче сообщения из справочника, данных для этих параметров нет.</p>' +
    "</div>"
  );
}

/** Подсветка в обе стороны: параметр показывает свои байты, байт — свои параметры. */
export function wireHighlight(root) {
  const rows = root.querySelectorAll(".sig-row");
  const cells = root.querySelectorAll(".byte");

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

export function format(value) {
  if (value === null) return "—";
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
}

export function hex2(value) {
  return value.toString(16).toUpperCase().padStart(2, "0");
}

export function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
