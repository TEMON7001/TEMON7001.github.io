// Экран «Лог» — разбор дампа с шины целиком.

import { parseLog, summarize } from "../import/index.js";
import { resolve, KIND } from "../core/resolve.js";
import { renderResult, wireHighlight, escapeHtml } from "./result-view.js";
import { faultNoticeCard, faultNoticeLine, sendLogButton } from "./contact.js";

export const meta = { id: "log", title: "Разбор лога", short: "Лог", icon: "📄" };

const SAMPLE =
  "(1755859200.100000) can0 0CF00400#FFA5A7E02EFFFFFF\n" +
  "(1755859200.120000) can0 0CF00400#FF6464401FFFFFFF\n" +
  "(1755859200.140000) can0 18FEEE00#7D46FFFFFFFFFFFF\n";

let context;
let source; // разобранный лог целиком
let groups = []; // сводка по сообщениям
let nodes = {};

export function mount(root, ctx) {
  context = ctx;

  root.innerHTML =
    '<h2 class="screen-h2">Разбор лога</h2>' +
    '<div class="card">' +
      '<div class="input-tools">' +
        '<label class="chip" for="log-file">Выбрать файл</label>' +
        '<input type="file" id="log-file" accept=".log,.txt,.csv,.asc,.trc,text/*" hidden>' +
        '<button type="button" class="chip" data-act="paste">Вставить</button>' +
        '<button type="button" class="chip" data-act="clear">Очистить</button>' +
      "</div>" +
      '<textarea id="log-text" rows="4" class="mono" spellcheck="false" ' +
        'placeholder="Вставьте строки лога или выберите файл" aria-label="Текст лога"></textarea>' +
      '<button type="button" class="chip" data-act="parse" id="log-parse">Разобрать</button>' +
    "</div>" +
    '<div id="log-summary"></div>' +
    '<div id="log-details"></div>' +
    '<div id="log-groups"></div>';

  nodes = {
    file: root.querySelector("#log-file"),
    text: root.querySelector("#log-text"),
    summary: root.querySelector("#log-summary"),
    details: root.querySelector("#log-details"),
    groups: root.querySelector("#log-groups"),
  };

  nodes.file.addEventListener("change", onFile);
  root.querySelector(".input-tools").addEventListener("click", onTool);
  root.querySelector("#log-parse").addEventListener("click", () => run(nodes.text.value));

  // Пример нужен, чтобы экран не был пустым при первом открытии.
  nodes.summary.addEventListener("click", (event) => {
    if (!event.target.closest('button[data-act="sample"]')) return;
    nodes.text.value = SAMPLE;
    run(SAMPLE);
  });

  nodes.summary.innerHTML = hint();
}

// ==== Ввод ====

function onTool(event) {
  const button = event.target.closest("button[data-act]");
  if (!button) return;

  if (button.dataset.act === "clear") {
    nodes.text.value = "";
    source = null;
    groups = [];
    nodes.summary.innerHTML = hint();
    nodes.details.innerHTML = "";
    nodes.groups.innerHTML = "";
  } else if (button.dataset.act === "paste") {
    paste();
  }
}

async function paste() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      nodes.text.value = text;
      run(text);
    }
  } catch {
    nodes.summary.innerHTML = problem(
      "Доступ к буферу обмена не предоставлен. Вставьте текст в поле долгим нажатием."
    );
  }
}

async function onFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  nodes.summary.innerHTML = card("Читаем файл " + escapeHtml(file.name) + "…");
  try {
    const text = await file.text();
    // Файл может быть на десятки мегабайт: в поле ввода показываем только начало,
    // разбираем при этом всё.
    nodes.text.value = text.length > 5000 ? text.slice(0, 5000) + "\n…" : text;
    run(text, file.name);
  } catch (error) {
    nodes.summary.innerHTML = problem("Файл не прочитался: " + escapeHtml(error.message));
  }
}

// ==== Разбор ====

function run(text, fileName) {
  if (!String(text || "").trim()) {
    nodes.summary.innerHTML = hint();
    return;
  }

  const started = performance.now();
  source = parseLog(text);
  groups = summarize(source.frames, context.protocol);
  const spent = Math.round(performance.now() - started);

  nodes.details.innerHTML = "";
  nodes.summary.innerHTML = summaryCard(source, spent, fileName);
  renderGroups();
}

function summaryCard(log, spent, fileName) {
  const rows = [
    ["Формат", log.format],
    ["Строк", String(log.lines)],
    ["Кадров", String(log.frames.length)],
    ["Сообщений", String(groups.length)],
  ];
  if (log.time && log.time.span > 0) rows.push(["Длительность", seconds(log.time.span)]);
  if (log.skipped) rows.push(["Не разобрано строк", String(log.skipped)]);
  rows.push(["Время разбора", spent + " мс"]);

  const samples = log.samples.length
    ? '<p class="hint">Не разобрались, например: ' +
      log.samples.map((s) => "строка " + s.number + " — <span class=\"mono\">" + escapeHtml(s.line) + "</span>").join("; ") +
      "</p>"
    : "";

  return (
    '<div class="card">' +
      (fileName ? '<div class="card-title">' + escapeHtml(fileName) + "</div>" : "") +
      '<div class="kv">' +
        rows.map(([k, v]) => '<div class="k">' + k + '</div><div class="v mono">' + escapeHtml(v) + "</div>").join("") +
      "</div>" +
      samples +
    "</div>" +
    (log.frames.length ? filtersCard() : "")
  );
}

function filtersCard() {
  return (
    '<div class="card">' +
      '<div class="row2">' +
        '<div><label class="field-label" for="log-pgn">PGN</label>' +
          '<input id="log-pgn" class="mono" inputmode="numeric" autocomplete="off" placeholder="61444 или F004"></div>' +
        '<div><label class="field-label" for="log-sa">Адрес (SA)</label>' +
          '<input id="log-sa" class="mono" inputmode="numeric" autocomplete="off" placeholder="0"></div>' +
      "</div>" +
    "</div>"
  );
}

// ==== Список сообщений ====

function renderGroups() {
  const pgnFilter = value("log-pgn");
  const saFilter = value("log-sa");

  const shown = groups.filter((group) => matches(group, pgnFilter, saFilter));
  const known = shown.filter((group) => context.catalog && context.catalog.find(group.pgn));
  const unknown = shown.filter((group) => !context.catalog || !context.catalog.find(group.pgn));

  let html = "";
  if (!groups.length) {
    html = card("Кадров J1939 в логе не нашлось.");
  } else {
    html += groupCard("Сообщения · " + known.length, known);
    // Нераспознанные не прячем: механику важно видеть, что в шине есть чужой трафик.
    if (unknown.length) html += groupCard("Не распознаны · " + unknown.length, unknown, true);
    if (!shown.length) html += card("Под фильтр ничего не подошло.");
  }

  // Логи с реальной техники — то, чего проекту не хватает больше всего,
  // поэтому просьба висит под каждым разобранным логом.
  if (groups.length) {
    html +=
      '<div class="card">' +
        '<p class="hint">Есть лог с настоящей машины? Пришлите — по нему научим приложение ' +
        "разбирать коды неисправностей.</p>" +
        '<div class="input-tools">' + sendLogButton("Прислать лог") + "</div>" +
      "</div>";
  }

  nodes.groups.innerHTML = html;

  nodes.groups.querySelectorAll("button[data-key]").forEach((button) => {
    button.addEventListener("click", () => showFrame(button.dataset.key));
  });

  const pgn = document.getElementById("log-pgn");
  const sa = document.getElementById("log-sa");
  if (pgn && !pgn.dataset.wired) {
    pgn.dataset.wired = "1";
    pgn.addEventListener("input", renderGroups);
    sa.dataset.wired = "1";
    sa.addEventListener("input", renderGroups);
  }
}

function groupCard(title, list, unknown) {
  if (!list.length) return "";
  const rows = list
    .map((group) => {
      const message = context.catalog ? context.catalog.find(group.pgn) : null;
      const name = message ? message.acronym || message.name : "PGN не в справочнике";
      const period = group.periodMs ? Math.round(group.periodMs) + " мс" : "—";
      return (
        '<div class="ref-row">' +
          '<button type="button" class="ref-main" data-key="' + escapeHtml(group.key) + '">' +
            '<span class="ref-title">' + escapeHtml(name) +
              (message && message.acronym ? " · " + escapeHtml(message.name) : "") + "</span>" +
            '<span class="ref-sub mono">PGN ' + group.pgn + " · " + escapeHtml(group.pgnHex) +
              " · SA " + group.sa + " · " + group.count + " кадр" + ending(group.count) +
              " · " + period + "</span>" +
          "</button>" +
        "</div>" +
        faultNoticeLine(group.pgn, context.protocol)
      );
    })
    .join("");

  return (
    '<div class="card' + (unknown ? " card-unknown" : "") + '">' +
      '<div class="card-title">' + escapeHtml(title) + "</div>" + rows +
    "</div>"
  );
}

function showFrame(key) {
  const group = groups.find((item) => item.key === key);
  if (!group || !context.catalog) return;

  const result = resolve(group.last, context.catalog, context.protocol);
  const when = group.last.time !== null ? " · " + seconds(group.last.time - source.time.first) + " от начала" : "";

  nodes.details.innerHTML =
    '<div class="card">' +
      '<button type="button" class="chip" data-close="1">← К списку</button>' +
      '<p class="hint">Последний кадр из ' + group.count + ", строка " + group.last.number + when + "</p>" +
    "</div>" +
    renderResult(result) +
    faultNoticeCard(result.id.pgn, context.protocol);

  wireHighlight(nodes.details);
  nodes.details.querySelector("[data-close]").addEventListener("click", () => {
    nodes.details.innerHTML = "";
  });
  window.scrollTo(0, 0);
}

// ==== Мелочи ====

function matches(group, pgnFilter, saFilter) {
  if (pgnFilter) {
    const query = pgnFilter.toUpperCase().replace(/^0X/, "");
    const dec = String(group.pgn);
    const hex = group.pgnHex.slice(2);
    if (!dec.startsWith(query) && !hex.startsWith(query)) return false;
  }
  if (saFilter && String(group.sa) !== saFilter.trim()) return false;
  return true;
}

function value(id) {
  const node = document.getElementById(id);
  return node ? node.value.trim() : "";
}

function seconds(value) {
  if (!isFinite(value)) return "—";
  return value.toFixed(value < 10 ? 2 : 1) + " с";
}

function ending(count) {
  const tens = count % 100;
  const units = count % 10;
  if (units === 1 && tens !== 11) return "";
  if (units >= 2 && units <= 4 && (tens < 12 || tens > 14)) return "а";
  return "ов";
}

function hint() {
  return (
    '<div class="card">' +
      '<p class="lead">Выберите файл лога или вставьте его строки в поле.</p>' +
      '<p class="hint">Понимается вывод candump в обоих видах — ' +
      '<span class="mono">can0 18F00400#FFA5A7…</span> и <span class="mono">can0 18F00400 [8] FF A5…</span>, — ' +
      "а также csv и произвольный текст, где в строке есть идентификатор и байты. " +
      "После разбора будет видно, какие сообщения идут по шине, как часто и от кого.</p>" +
      '<p class="hint"><button type="button" class="chip" data-act="sample">Показать на примере</button></p>' +
    "</div>"
  );
}

function problem(message) {
  return '<div class="card card-problem"><p class="problem-text">' + message + "</p></div>";
}

function card(text) {
  return '<div class="card"><p class="hint">' + text + "</p></div>";
}

