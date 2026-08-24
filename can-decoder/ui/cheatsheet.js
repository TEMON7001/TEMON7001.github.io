// Экран «Памятка» — краткая справка по структуре J1939. Текст лежит в data/glossary.json,
// вёрстка не зависит от его состава: разделы и блоки рисуются по данным.

import { escapeHtml } from "./result-view.js";

export const meta = { id: "cheatsheet", title: "Памятка", short: "Памятка", icon: "💡" };

let loaded = null;

export function mount(root, ctx) {
  root.innerHTML = '<h2 class="screen-h2">Памятка</h2><div id="cheat-body"></div>';
  const body = root.querySelector("#cheat-body");

  if (loaded) {
    body.innerHTML = render(loaded);
    return;
  }

  body.innerHTML = '<div class="card"><p class="hint">Загружаем…</p></div>';
  fetch("data/glossary.json")
    .then((response) => {
      if (!response.ok) throw new Error("файл не открылся, ответ " + response.status);
      return response.json();
    })
    .then((data) => {
      loaded = data;
      body.innerHTML = render(data);
    })
    .catch((error) => {
      body.innerHTML =
        '<div class="card card-problem"><p class="problem-text">Памятка не загрузилась: ' +
        escapeHtml(error.message) + "</p></div>";
    });
}

function render(data) {
  const sections = (data.sections || []).map(section).join("");
  return (
    sections +
    '<p class="disclaimer">Памятка описывает структуру SAE J1939 и работает без сети. ' +
    "Значения параметров смотрите на экране «Справочник».</p>"
  );
}

function section(item) {
  const blocks = (item.blocks || []).map(block).join("");
  return '<div class="card"><h3 class="cheat-title">' + escapeHtml(item.title) + "</h3>" + blocks + "</div>";
}

function block(item) {
  if (item.type === "table") return table(item);
  return '<p class="cheat-text">' + escapeHtml(item.text || "") + "</p>";
}

function table(item) {
  const head = (item.head || []).map((cell) => "<th>" + escapeHtml(cell) + "</th>").join("");
  const rows = (item.rows || [])
    .map((row) => "<tr>" + row.map((cell) => "<td>" + escapeHtml(cell) + "</td>").join("") + "</tr>")
    .join("");
  // Таблица шире экрана прокручивается внутри себя: страница вбок не едет.
  return (
    '<div class="cheat-scroll"><table class="cheat-table">' +
    (head ? "<thead><tr>" + head + "</tr></thead>" : "") +
    "<tbody>" + rows + "</tbody></table></div>"
  );
}
