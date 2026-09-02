// Что можно делать с комнатой: группы, варианты и параметры материалов.
// Это описание — единственный источник правды и для экрана «Работы», и для сборки
// списка закупки: добавили вариант здесь — он появился и в выборе, и в списке.
//
// Значений расходов и фасовок тут нет. Поля тянут их из data/materials.json по пути
// в `source` и `def` — чтобы справочные числа правились в одном файле.

// Параметры материалов. Пустой список — у материала нечего настраивать.
export const PARAMS = {
  wallpaper: [
    { key: "rollWidth", label: "Ширина рулона, м", kind: "select", source: "wallpaper.rollWidths_m", def: "wallpaper.defaults.rollWidth_m" },
    { key: "rollLength", label: "Длина рулона, м", kind: "select", source: "wallpaper.rollLengths_m", def: "wallpaper.defaults.rollLength_m" },
    { key: "rapport", label: "Раппорт, м", kind: "select", source: "wallpaper.rapports_m", def: "wallpaper.defaults.rapport_m" },
    { key: "kind", label: "Тип обоев", kind: "select", source: "wallpaper.glue.kinds", def: "wallpaper.defaults.kind" },
  ],
  paintWalls: [
    { key: "perCoat", label: "Расход, л/м²", kind: "number", def: "paint.perCoat_l_per_m2" },
    { key: "coats", label: "Слоёв", kind: "number", def: "paint.coats", whole: true },
  ],
  paintCeiling: [
    { key: "perCoat", label: "Расход, л/м²", kind: "number", def: "paint.perCoat_l_per_m2" },
    { key: "coats", label: "Слоёв", kind: "number", def: "paint.coats", whole: true },
  ],
  plaster: [
    { key: "layer", label: "Слой штукатурки, мм", kind: "number", def: "plaster.layer_mm" },
  ],
  laminate: [
    { key: "packArea", label: "В упаковке, м²", kind: "number", def: "laminate.packArea_m2" },
    { key: "laying", label: "Укладка", kind: "select", source: "laminate.layings", def: "laminate.layings.0.id" },
    { key: "underlay", label: "Считать подложку", kind: "check", def: true },
  ],
  tile: [
    { key: "sideA", label: "Плитка, мм", kind: "number", def: "tile.defaults.sideA_mm", whole: true },
    { key: "sideB", label: "на, мм", kind: "number", def: "tile.defaults.sideB_mm", whole: true },
    { key: "joint", label: "Шов, мм", kind: "number", def: "tile.defaults.joint_mm" },
    { key: "thickness", label: "Толщина, мм", kind: "number", def: "tile.defaults.thickness_mm" },
  ],
  skirting: [
    { key: "plankLength", label: "Длина планки, м", kind: "number", def: "skirting.plankLength_m" },
  ],
};

// Группы выбора: в каждой ровно один вариант, включая «ничего».
// `calc` — имя расчёта из core/materials.js, `params` — набор полей из PARAMS.
export const GROUPS = [
  {
    id: "walls",
    title: "Стены",
    options: [
      { id: "wallpaper", name: "Обои", calc: "wallpaper", params: "wallpaper" },
      { id: "paint", name: "Краска", calc: "paintWalls", params: "paintWalls" },
      { id: "plaster", name: "Штукатурка", calc: "plaster", params: "plaster" },
      { id: "none", name: "Ничего" },
    ],
  },
  {
    id: "floor",
    title: "Пол",
    options: [
      { id: "laminate", name: "Ламинат", calc: "laminate", params: "laminate" },
      { id: "tile", name: "Плитка", calc: "tile", params: "tile" },
      { id: "linoleum", name: "Линолеум", calc: "linoleum" },
      { id: "none", name: "Ничего" },
    ],
  },
  {
    id: "ceiling",
    title: "Потолок",
    options: [
      { id: "paint", name: "Краска", calc: "paintCeiling", params: "paintCeiling" },
      { id: "stretch", name: "Натяжной", calc: "stretchCeiling" },
      { id: "none", name: "Ничего" },
    ],
  },
];

// Мелочёвка: независимые галочки. Из-за неё чаще всего и едут в магазин второй раз.
export const EXTRAS = [
  { id: "skirting", name: "Плинтус", calc: "skirting", params: "skirting" },
  {
    id: "primer",
    name: "Грунтовка",
    calc: "primer",
    hint: "Считается по стенам, а если потолок красится — то и по потолку.",
  },
  { id: "thresholds", name: "Порожки", calc: "thresholds" },
];

// На старте не выбрано ничего: приложение не знает, что человек затеял,
// и подставлять за него ремонт целиком было бы враньём.
export const DEFAULT_WORKS = {
  walls: "none",
  floor: "none",
  ceiling: "none",
  skirting: false,
  primer: false,
  thresholds: false,
};

/** Выбранный вариант группы вместе с его описанием. */
export function chosen(works, group) {
  const id = works[group.id] || "none";
  return group.options.find((o) => o.id === id) || group.options[group.options.length - 1];
}

/** Значение по пути в справочнике: at(data, "wallpaper.defaults.rollWidth_m"). */
export function at(data, path) {
  if (typeof path !== "string") return path;
  return path.split(".").reduce((node, key) => (node == null ? undefined : node[key]), data);
}

/**
 * Текущее значение параметра: то, что человек ввёл, иначе значение по умолчанию
 * из справочника. Незаполненные параметры в состоянии не хранятся — так значения
 * по умолчанию остаются живыми и меняются вместе со справочником.
 */
export function paramValue(params, field, data) {
  const saved = params ? params[field.key] : undefined;
  if (saved !== undefined && saved !== null && saved !== "") return saved;
  return at(data, field.def);
}

/** Варианты для поля-списка: числа или пары {id, name} из справочника. */
export function fieldOptions(field, data) {
  const source = at(data, field.source);
  if (!Array.isArray(source)) return [];
  return source.map((item) =>
    typeof item === "object" ? { value: item.id, name: item.name } : { value: item, name: String(item).replace(".", ",") }
  );
}
