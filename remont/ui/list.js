// Экран «Список» — то, ради чего приложение написано: один список закупки
// по разделам, с количествами в единицах покупки, своими ценами и итогом.
// Пересчитывается сам при любом изменении комнаты или работ: кнопки «рассчитать» нет.

import { buildList, lineSum, totals, toText } from "../core/list.js";
import { formatQty, formatMoney, unitAccusative } from "../core/plural.js";

export const meta = { id: "list", title: "Список", short: "Список", icon: "🧾" };

let context;
let root;
// Собранный список держим здесь: пересчёт сумм при вводе цены не должен
// заново гонять расчёты материалов.
let current = null;

export function mount(node, ctx) {
  context = ctx;
  root = node;
  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  root.addEventListener("change", onInput);
  render();
}

export function refresh(ctx) {
  context = ctx;
  render();
}

function render() {
  const { geometry, state, data } = context;

  if (!data) {
    current = null;
    root.innerHTML =
      '<div class="card"><p class="result-warning">Справочник материалов не загрузился, ' +
      "считать не по чему. Переоткройте приложение.</p></div>";
    return;
  }

  current = buildList(geometry, state.works, state.params, data);

  if (!current.chosen) {
    root.innerHTML = empty(
      "Пока пусто",
      "Отметьте на вкладке «Работы», что делаете со стенами, полом и потолком — список соберётся сам.",
      "works",
      "Перейти к работам"
    );
    return;
  }

  if (current.needsRoom) {
    root.innerHTML = empty(
      "Не заданы размеры",
      "Работы выбраны, но считать не от чего. Заполните длину, ширину и высоту комнаты.",
      "room",
      "Заполнить размеры"
    );
    return;
  }

  const sections = current.sections.filter((s) => s.items.length || s.problems.length);

  root.innerHTML =
    sections.map(section).join("") +
    (current.items.length
      ? '<button type="button" class="wide-btn" data-copy>Скопировать список</button>'
      : "") +
    '<p class="disclaimer">Количества — с запасом на подрезку, в единицах покупки. ' +
    "Цены свои: приложение их не знает и не подставляет. Работы и доставка не считаются.</p>" +
    '<div class="total-spacer"></div>' +
    totalBar();

  updateSums();
}

function section(data) {
  return (
    '<div class="card">' +
    '<p class="card-title">' + data.title + "</p>" +
    data.items.map(line).join("") +
    data.problems
      .map((p) => '<p class="result-warning">' + escapeHtml(p.name) + ": " + escapeHtml(p.message) + "</p>")
      .join("") +
    "</div>"
  );
}

function line(item) {
  const { state } = context;
  const isBought = Boolean(state.bought[item.id]);
  const price = state.prices[item.id] || "";

  return (
    '<div class="line' + (isBought ? " bought" : "") + '" data-line="' + item.id + '">' +
    '<label class="line-head">' +
    '<input type="checkbox" data-bought="' + item.id + '"' + (isBought ? " checked" : "") + ">" +
    '<span class="line-name">' + escapeHtml(item.name) + "</span>" +
    '<span class="line-qty">' + formatQty(item.qty, item.unit) + "</span>" +
    "</label>" +
    (item.note ? '<p class="line-note">' + escapeHtml(item.note) + "</p>" : "") +
    '<div class="line-money">' +
    '<input type="text" class="price" data-price="' + item.id + '" inputmode="decimal" ' +
    'autocomplete="off" value="' + escapeHtml(price) + '" placeholder="цена за ' +
    unitAccusative(item.unit) + ', ₽">' +
    '<span class="line-sum" data-sum="' + item.id + '"></span>' +
    "</div></div>"
  );
}

// Итог висит над таббаром и виден всегда: сумма — то, ради чего вводят цены,
// и искать её прокруткой в конец списка человек не должен.
function totalBar() {
  return (
    '<div class="total-bar">' +
    '<div class="total-main"><span>Итого</span><span class="total-sum" data-total></span></div>' +
    '<p class="total-note" data-total-note></p>' +
    "</div>"
  );
}

/** Пересчёт денег без перерисовки списка: меняются только цифры. */
function updateSums() {
  if (!current || !current.items.length) return;
  const { state } = context;

  for (const item of current.items) {
    const node = root.querySelector('[data-sum="' + item.id + '"]');
    if (!node) continue;
    const sum = lineSum(item, state.prices);
    node.textContent = sum === null ? "" : formatMoney(sum);
  }

  const sums = totals(current.items, state.prices, state.bought);
  const totalNode = root.querySelector("[data-total]");
  const noteNode = root.querySelector("[data-total-note]");
  if (!totalNode) return;

  totalNode.textContent = sums.priced ? formatMoney(sums.total) : "—";

  const notes = [];
  if (sums.remaining !== sums.total) notes.push("осталось купить на " + formatMoney(sums.remaining));
  if (sums.unpriced) notes.push("ещё " + formatQty(sums.unpriced, "позиция") + " без цены");
  noteNode.textContent = notes.join(" · ");
  noteNode.classList.toggle("hidden", notes.length === 0);
}

function empty(title, text, screen, action) {
  return (
    '<div class="card">' +
    '<p class="card-title">' + title + "</p>" +
    '<p class="placeholder">' + text + "</p>" +
    '<button type="button" class="wide-btn" data-go="' + screen + '">' + action + "</button>" +
    "</div>"
  );
}

// ==== Нажатия ====

function onClick(event) {
  const go = event.target.closest("[data-go]");
  if (go) {
    context.go(go.dataset.go);
    return;
  }

  const copy = event.target.closest("[data-copy]");
  if (copy) copyList(copy);
}

function onInput(event) {
  const bought = event.target.closest("[data-bought]");
  if (bought) {
    context.toggleBought(bought.dataset.bought, bought.checked);
    const row = root.querySelector('[data-line="' + bought.dataset.bought + '"]');
    if (row) row.classList.toggle("bought", bought.checked);
    updateSums();
    return;
  }

  const price = event.target.closest("[data-price]");
  if (price) {
    context.updatePrice(price.dataset.price, price.value.trim());
    updateSums();
  }
}

async function copyList(button) {
  const { geometry, state } = context;
  const text = toText(current, geometry, state.prices, state.bought);
  const done = await toClipboard(text);

  const was = button.textContent;
  button.textContent = done ? "Скопировано" : "Скопируйте вручную";
  setTimeout(() => { button.textContent = was; }, 1600);

  // Буфер обмена может быть закрыт — в старом WebView или без разрешения.
  // Оставить человека ни с чем нельзя: показываем текст, его можно выделить руками.
  const old = root.querySelector(".copy-fallback");
  if (old) old.remove();
  if (done) return;

  const area = document.createElement("textarea");
  area.className = "copy-fallback";
  area.readOnly = true;
  area.rows = 10;
  area.value = text;
  button.insertAdjacentElement("afterend", area);
  area.focus();
  area.select();
}

async function toClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Старый WebView или запрет на доступ к буферу: пробуем через скрытое поле.
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const done = document.execCommand("copy");
      document.body.removeChild(area);
      return done;
    } catch {
      return false;
    }
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
