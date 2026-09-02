// Экран «Работы» — что делаем со стенами, полом и потолком.
// Всё описание вариантов лежит в core/works.js, здесь только отрисовка и обработка нажатий.

import { GROUPS, EXTRAS, PARAMS, chosen, paramValue, fieldOptions } from "../core/works.js";

export const meta = { id: "works", title: "Работы", short: "Работы", icon: "🧰" };

let context;
let root;
// Развёрнутые панели параметров переживают перерисовку карточек.
const expanded = new Set();

export function mount(node, ctx) {
  context = ctx;
  root = node;
  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  root.addEventListener("change", onInput);
  render();
}

function render() {
  const { state, data } = context;

  if (!data) {
    root.innerHTML =
      '<div class="card"><p class="result-warning">Справочник материалов не загрузился. ' +
      "Выбирать работы не из чего — переоткройте приложение.</p></div>";
    return;
  }

  root.innerHTML =
    '<p class="hint" style="margin:0 0 0.6rem">Отметьте, что делаете. Список закупки ' +
    "соберётся сам — считать ничего не нужно.</p>" +
    GROUPS.map((group) => groupCard(group, state, data)).join("") +
    extrasCard(state, data) +
    '<p class="disclaimer">У большинства значения по умолчанию подойдут: параметры материала ' +
    "спрятаны под ссылкой и нужны, только если вы уже выбрали конкретный товар.</p>";
}

function groupCard(group, state, data) {
  const option = chosen(state.works, group);
  return (
    '<div class="card">' +
    '<p class="card-title">' + group.title + "</p>" +
    '<div class="chips" data-group="' + group.id + '">' +
    group.options
      .map(
        (o) =>
          '<button type="button" class="chip' + (o.id === "none" ? " chip-none" : "") +
          (o.id === option.id ? " active" : "") +
          '" data-value="' + o.id + '" aria-pressed="' + (o.id === option.id) + '">' + o.name + "</button>"
      )
      .join("") +
    "</div>" +
    paramsBlock(option.params, state, data) +
    "</div>"
  );
}

function extrasCard(state, data) {
  return (
    '<div class="card">' +
    '<p class="card-title">Ещё</p>' +
    EXTRAS.map((extra) => {
      const on = Boolean(state.works[extra.id]);
      return (
        '<label class="check">' +
        '<input type="checkbox" data-extra="' + extra.id + '"' + (on ? " checked" : "") + ">" +
        "<span>" + extra.name +
        (extra.hint ? '<span class="check-hint">' + extra.hint + "</span>" : "") +
        "</span></label>" +
        (on ? paramsBlock(extra.params, state, data) : "")
      );
    }).join("") +
    "</div>"
  );
}

// Параметры показываются только у выбранного варианта и по умолчанию свёрнуты:
// гнать всех через десяток полей ради значений, которые и так подойдут, нельзя.
function paramsBlock(paramsId, state, data) {
  const fields = paramsId ? PARAMS[paramsId] : null;
  if (!fields || !fields.length) return "";

  const open = expanded.has(paramsId);
  const values = state.params[paramsId];
  const inputs = fields.filter((f) => f.kind !== "check");
  const checks = fields.filter((f) => f.kind === "check");

  return (
    '<button type="button" class="params-toggle" data-toggle="' + paramsId + '" aria-expanded="' + open + '">' +
    (open ? "Параметры ▴" : "Параметры ▾") +
    "</button>" +
    '<div class="params' + (open ? "" : " hidden") + '" data-body="' + paramsId + '">' +
    (inputs.length ? '<div class="row2">' + inputs.map((f) => field(f, paramsId, values, data)).join("") + "</div>" : "") +
    checks.map((f) => field(f, paramsId, values, data)).join("") +
    "</div>"
  );
}

function field(spec, paramsId, values, data) {
  const id = "param-" + paramsId + "-" + spec.key;
  const value = paramValue(values, spec, data);
  const attrs = ' data-param="' + paramsId + '" data-key="' + spec.key + '" id="' + id + '"';

  if (spec.kind === "check") {
    return (
      '<label class="check">' +
      '<input type="checkbox"' + attrs + (value === false ? "" : " checked") + ">" +
      "<span>" + spec.label + "</span></label>"
    );
  }

  if (spec.kind === "select") {
    const options = fieldOptions(spec, data)
      .map(
        (o) =>
          '<option value="' + o.value + '"' +
          (String(o.value) === String(value) ? " selected" : "") + ">" + o.name + "</option>"
      )
      .join("");
    return (
      "<div>" +
      '<label class="field-label" for="' + id + '">' + spec.label + "</label>" +
      "<select" + attrs + ">" + options + "</select>" +
      "</div>"
    );
  }

  // Как и на экране «Комната»: type=text, потому что type=number теряет значение
  // с запятой, а запятая — то, что человек нажимает на русской клавиатуре.
  return (
    "<div>" +
    '<label class="field-label" for="' + id + '">' + spec.label + "</label>" +
    '<input type="text"' + attrs + ' inputmode="' + (spec.whole ? "numeric" : "decimal") +
    '" autocomplete="off" value="' + format(value) + '">' +
    "</div>"
  );
}

// ==== Нажатия ====

function onClick(event) {
  const chip = event.target.closest(".chip");
  if (chip) {
    const group = chip.closest("[data-group]").dataset.group;
    if (context.state.works[group] === chip.dataset.value) return;
    context.updateWorks({ [group]: chip.dataset.value });
    render();
    return;
  }

  const toggle = event.target.closest(".params-toggle");
  if (toggle) {
    const id = toggle.dataset.toggle;
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
    render();
  }
}

function onInput(event) {
  const extra = event.target.closest("[data-extra]");
  if (extra) {
    context.updateWorks({ [extra.dataset.extra]: extra.checked });
    render();
    return;
  }

  const param = event.target.closest("[data-param]");
  if (!param) return;

  const value = param.type === "checkbox" ? param.checked : param.value;
  // Перерисовки здесь нет намеренно: поле переписало бы само себя во время набора
  // и курсор прыгнул бы в конец.
  context.updateParams(param.dataset.param, { [param.dataset.key]: value });
}

function format(value) {
  if (typeof value === "number") return String(value).replace(".", ",");
  return value === undefined || value === null ? "" : String(value);
}
