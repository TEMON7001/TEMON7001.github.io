// Экран «Комната» — единственное место, где вводятся размеры.
// Ради этого всё и затевалось: длину, ширину и высоту человек вбивает один раз,
// а не по разу в каждый калькулятор.

import { DEFAULT_ROOM } from "../core/room.js";

export const meta = { id: "room", title: "Комната", short: "Комната", icon: "📐" };

// Раскладка полей: три коротких поля в строку, по карточке на смысловую группу.
const CARDS = [
  {
    title: "Размеры",
    fields: [
      { key: "length", label: "Длина, м" },
      { key: "width", label: "Ширина, м" },
      { key: "height", label: "Высота, м" },
    ],
  },
  {
    title: "Двери",
    hint: "Размеры задаются одни на все двери.",
    fields: [
      { key: "doors", label: "Сколько, шт", whole: true },
      { key: "doorWidth", label: "Ширина, м" },
      { key: "doorHeight", label: "Высота, м" },
    ],
  },
  {
    title: "Окна",
    hint: "Размеры задаются одни на все окна.",
    fields: [
      { key: "windows", label: "Сколько, шт", whole: true },
      { key: "windowWidth", label: "Ширина, м" },
      { key: "windowHeight", label: "Высота, м" },
    ],
  },
];

let context;
let resultNode = null;

export function mount(root, ctx) {
  context = ctx;

  root.innerHTML =
    // Заголовка экрана здесь нет намеренно: он уже стоит в шапке, а каждая
    // сэкономленная строка поднимает карточку с площадями ближе к первому экрану.
    '<p class="hint" style="margin:0 0 0.6rem">Размеры вводятся один раз — дальше они ' +
    "подставляются во все расчёты.</p>" +
    CARDS.map(card).join("") +
    '<div class="card result" id="room-result"></div>' +
    '<p class="disclaimer">Проёмы вычитаются из площади стен целиком. ' +
    "Ниши, выступы и скосы потолка приложение не считает — если они есть, поправьте размеры вручную.</p>";

  resultNode = root.querySelector("#room-result");

  for (const input of root.querySelectorAll("[data-field]")) {
    // Значение выставляется только здесь: переписывать поле во время набора нельзя,
    // курсор прыгает на конец, и человек не может исправить середину числа.
    input.value = format(ctx.state.room[input.dataset.field]);
    input.addEventListener("input", () => {
      context.updateRoom({ [input.dataset.field]: input.value });
    });
  }

  renderResult(ctx.geometry);
}

export function refresh(ctx) {
  renderResult(ctx.geometry);
}

function card(group) {
  return (
    '<div class="card">' +
    '<p class="card-title">' + group.title + "</p>" +
    '<div class="row3">' +
    group.fields.map(field).join("") +
    "</div>" +
    (group.hint ? '<p class="hint">' + group.hint + "</p>" : "") +
    "</div>"
  );
}

function field(spec) {
  const id = "room-" + spec.key;
  return (
    "<div>" +
    '<label class="field-label" for="' + id + '">' + spec.label + "</label>" +
    // type=text, а не number: на type=number Chrome отбрасывает значение с запятой,
    // а запятая — то, что человек нажимает на русской цифровой клавиатуре.
    '<input type="text" id="' + id + '" data-field="' + spec.key + '"' +
    ' inputmode="' + (spec.whole ? "numeric" : "decimal") + '" autocomplete="off">' +
    "</div>"
  );
}

function renderResult(g) {
  if (!resultNode) return;

  if (!g.valid) {
    resultNode.innerHTML =
      '<p class="placeholder">Заполните длину, ширину и высоту — остальное посчитается само.</p>';
    return;
  }

  resultNode.innerHTML =
    row("Площадь пола", fix(g.floorArea, 1) + " м²") +
    row("Площадь потолка", fix(g.ceilingArea, 1) + " м²") +
    row("Площадь стен", fix(g.wallsNet, 1) + " м²") +
    row("Периметр", fix(g.perimeter, 1) + " м") +
    '<p class="result-note">Стены: ' + fix(g.wallsGross, 1) + " м² минус " +
    fix(g.openingsArea, 2) + " м² проёмов. Периметр без дверных проёмов — " +
    fix(g.perimeterNet, 1) + " м, по нему считаются обои и плинтус.</p>" +
    g.warnings.map((w) => '<p class="result-warning">' + escapeHtml(w) + "</p>").join("");
}

function row(key, value) {
  return '<div class="result-row"><span class="k">' + key + '</span><span class="v">' + value + "</span></div>";
}

// Размеры — величины измеренные, а не счётные: 12,0 м² читается как измерение,
// а «12» выглядит как округление неизвестно откуда.
function fix(value, digits) {
  return Number(value).toFixed(digits).replace(".", ",");
}

// Значения по умолчанию показываем в русском виде: 2,7, а не 2.7.
function format(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return typeof value === "string" ? value : "";
  return String(number).replace(".", ",");
}

function escapeHtml(text) {
  return String(text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}

// Ключи полей должны совпадать с моделью комнаты — иначе ввод уйдёт в никуда.
for (const group of CARDS) {
  for (const spec of group.fields) {
    if (!(spec.key in DEFAULT_ROOM)) throw new Error("Неизвестное поле комнаты: " + spec.key);
  }
}
