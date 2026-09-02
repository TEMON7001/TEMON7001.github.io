// Расчёт материалов: чистые функции, каждая возвращает список позиций закупки.
// DOM здесь нет, справочные числа не зашиты — они приходят из data/materials.json.
//
// Позиция: { id, name, qty, unit, note }
//   id    — стабильный ключ, по нему хранится цена в localStorage. Менять нельзя.
//   qty   — всегда в единицах покупки и всегда округлено вверх. Дробных мешков не бывает.
//   note  — что принято в расчёте: запас, фасовка, допущение. Показывается под строкой.
//
// Не считается — бросаем CalcError с текстом для человека. Ноль и NaN в списке хуже
// отказа: человек примет их за ответ.

import { CalcError, ceilUnits, floorUnits, ceilToStep, round, choosePacks } from "./units.js";
import { formatNumber as n } from "./plural.js";

// ==== Стены: обои ====

/**
 * Обои считаются ПО ПОЛОСАМ, а не по площади.
 * Расчёт по площади занижает: полоса кроится из рулона целиком, а остаток короче
 * высоты потолка в дело не идёт. На контрольной комнате площадь даёт 4 рулона,
 * полосы — 5. Именно из-за этих недостающих рулонов человек едет в магазин второй раз.
 */
export function wallpaperPlan(geom, params, data) {
  const cfg = data.wallpaper;
  const rollWidth = pick(params.rollWidth, cfg.defaults.rollWidth_m);
  const rollLength = pick(params.rollLength, cfg.defaults.rollLength_m);
  const rapport = pick(params.rapport, cfg.defaults.rapport_m, true);

  if (!(geom.perimeterNet > 0) || !(geom.height > 0)) {
    throw new CalcError("Не заданы размеры комнаты.");
  }

  const stripHeight = geom.height + cfg.trim_m + rapport;
  const perRoll = floorUnits(rollLength / stripHeight);

  if (perRoll < 1) {
    throw new CalcError(
      "Из рулона длиной " + n(rollLength) + " м не выходит ни одной полосы: на полосу нужно " +
      n(stripHeight) + " м (высота " + n(geom.height) + " м + " + n(cfg.trim_m) +
      " м на подрезку" + (rapport > 0 ? " + раппорт " + n(rapport) + " м" : "") +
      "). Возьмите рулон длиннее или обои без раппорта."
    );
  }

  const strips = ceilUnits(geom.perimeterNet / rollWidth);
  return {
    rollWidth,
    rollLength,
    rapport,
    stripHeight,
    perRoll,
    strips,
    rolls: ceilUnits(strips / perRoll),
    // Доля рулона, которая уйдёт в обрезки: остаток короче полосы в дело не идёт.
    waste: 1 - (perRoll * stripHeight) / rollLength,
  };
}

export function wallpaper(geom, params, data) {
  const cfg = data.wallpaper;
  const kind = params.kind || cfg.defaults.kind;
  const { rollWidth, rollLength, rapport, stripHeight, perRoll, strips, rolls, waste } =
    wallpaperPlan(geom, params, data);

  const items = [
    {
      id: "wallpaper",
      name: "Обои " + n(rollWidth) + " × " + n(rollLength) + " м" +
        (rapport > 0 ? ", раппорт " + n(rapport) + " м" : ""),
      qty: rolls,
      unit: "рулон",
      note:
        "полос " + strips + " по " + n(stripHeight) + " м, из рулона выходит " + perRoll +
        "; оконные проёмы из периметра не вычтены — полосы над окном кроятся из целой" +
        (perRoll === 1
          ? ". Из рулона выходит одна полоса, в отход уходит " + Math.round(waste * 100) + " %"
          : ""),
    },
  ];

  // Клей считаем от площади стены под обоями, а не от площади купленных рулонов:
  // в рулонах сидит отход на подрезку, клея он не требует. Норма дана на квадратный
  // метр, а не на рулон, потому что рулон 1,06 вдвое больше рулона 0,53.
  const glue = cfg.glue;
  const rate = glue.perArea_g_per_m2[kind];
  if (rate) {
    const pasted = geom.perimeterNet * geom.height;
    const grams = pasted * rate;
    items.push({
      id: "wallpaper-glue",
      name: "Клей обойный, пачка " + glue.packSize_g + " г",
      qty: ceilUnits(grams / glue.packSize_g),
      unit: "пачка",
      note: n(pasted, 1) + " м² стен под обоями × " + n(rate) + " г/м² = " + Math.round(grams) + " г",
    });
  }

  return items;
}

// ==== Стены и потолок: краска, грунтовка ====

const PAINT_PLACE = {
  walls: { name: "Краска для стен", id: "paint-walls" },
  ceiling: { name: "Краска для потолка", id: "paint-ceiling" },
};

/**
 * Фасовка подбирается комбинацией с минимальным перерасходом: 2,88 л — это
 * банка 2,7 плюс банка 0,9, а не одна девятилитровая.
 */
export function paint(area, params, data, place = "walls") {
  const cfg = data.paint;
  const perCoat = pick(params.perCoat, cfg.perCoat_l_per_m2);
  const coats = Math.max(1, Math.round(pick(params.coats, cfg.coats)));
  const target = PAINT_PLACE[place] || PAINT_PLACE.walls;

  if (!(area > 0)) throw new CalcError("Не задана площадь под покраску.");

  const liters = area * perCoat * coats;
  const chosen = choosePacks(liters, cfg.packs_l);

  return chosen.picks.map((p, index) => ({
    id: target.id + "-" + p.size,
    name: target.name + ", банка " + n(p.size) + " л",
    qty: p.count,
    unit: "банка",
    note: index > 0 ? "" :
      n(area, 1) + " м² × " + n(perCoat) + " л/м² × " + coats + " сл. = " + n(liters) +
      " л, берём " + n(chosen.total) + " л",
  }));
}

export function primer(area, data, place = "walls") {
  const cfg = data.primer;
  if (!(area > 0)) throw new CalcError("Не задана площадь под грунтовку.");

  const liters = area * cfg.consumption_l_per_m2;
  const chosen = choosePacks(liters, cfg.packs_l);

  return chosen.picks.map((p, index) => ({
    id: "primer-" + place + "-" + p.size,
    name: "Грунтовка, канистра " + n(p.size) + " л",
    qty: p.count,
    unit: "канистра",
    note: index > 0 ? "" :
      n(area, 1) + " м² × " + n(cfg.consumption_l_per_m2) + " л/м² = " + n(liters) + " л",
  }));
}

// ==== Стены: штукатурка и шпатлёвка ====

export function plaster(geom, params, data) {
  const plasterCfg = data.plaster;
  const puttyCfg = data.putty;
  const layer = pick(params.layer, plasterCfg.layer_mm);

  if (!(geom.wallsNet > 0)) throw new CalcError("Не задана площадь стен.");

  const plasterKg = geom.wallsNet * layer * plasterCfg.consumption_kg_per_m2_per_mm;
  const puttyKg = geom.wallsNet * puttyCfg.consumption_kg_per_m2;

  return [
    {
      id: "plaster",
      name: "Штукатурка, мешок " + plasterCfg.bag_kg + " кг",
      qty: ceilUnits(plasterKg / plasterCfg.bag_kg),
      unit: "мешок",
      note: n(geom.wallsNet, 1) + " м² × слой " + n(layer) + " мм × " +
        n(plasterCfg.consumption_kg_per_m2_per_mm) + " кг = " + Math.round(plasterKg) + " кг",
    },
    {
      id: "putty",
      name: "Шпатлёвка, мешок " + puttyCfg.bag_kg + " кг",
      qty: ceilUnits(puttyKg / puttyCfg.bag_kg),
      unit: "мешок",
      note: n(geom.wallsNet, 1) + " м² × " + n(puttyCfg.consumption_kg_per_m2) + " кг/м² = " +
        Math.round(puttyKg) + " кг",
    },
  ];
}

// ==== Пол: ламинат ====

export function laminate(geom, params, data) {
  const cfg = data.laminate;
  const packArea = pick(params.packArea, cfg.packArea_m2);
  const laying = params.laying || "straight";
  const reserve = cfg.reserve[laying] !== undefined ? cfg.reserve[laying] : cfg.reserve.straight;

  if (!(geom.floorArea > 0)) throw new CalcError("Не заданы размеры комнаты.");
  if (!(packArea > 0)) throw new CalcError("Площадь упаковки должна быть больше нуля.");

  const items = [
    {
      id: "laminate",
      name: "Ламинат",
      qty: ceilUnits((geom.floorArea * (1 + reserve)) / packArea),
      unit: "упаковка",
      note: n(geom.floorArea, 1) + " м² + запас " + Math.round(reserve * 100) +
        " % на подрезку, в упаковке " + n(packArea) + " м²",
    },
  ];

  if (params.underlay !== false) {
    const rollArea = pick(params.underlayRoll, cfg.underlay.rollArea_m2);
    items.push({
      id: "underlay",
      name: "Подложка",
      qty: ceilUnits(geom.floorArea / rollArea),
      unit: "рулон",
      note: "рулон " + n(rollArea) + " м² на " + n(geom.floorArea, 1) + " м² пола",
    });
  }

  return items;
}

// ==== Пол: плитка ====

export function tile(geom, params, data) {
  const cfg = data.tile;
  const a = pick(params.sideA, cfg.defaults.sideA_mm);
  const b = pick(params.sideB, cfg.defaults.sideB_mm);
  const joint = pick(params.joint, cfg.defaults.joint_mm, true);
  const thickness = pick(params.thickness, cfg.defaults.thickness_mm);

  if (!(geom.floorArea > 0)) throw new CalcError("Не заданы размеры комнаты.");
  if (!(a > 0) || !(b > 0)) throw new CalcError("Укажите размер плитки в миллиметрах.");

  // Шов входит в шаг раскладки: плитка 300 со швом 2 занимает 302 мм.
  const perM2 = 1 / (((a + joint) / 1000) * ((b + joint) / 1000));
  const count = ceilUnits(geom.floorArea * perM2 * (1 + cfg.reserve));

  const rate = adhesiveRate(Math.max(a, b), cfg.adhesive.rates_kg_per_m2);
  const adhesiveKg = geom.floorArea * rate;

  // Затирка: длина швов на квадратный метр, сечение шва и плотность смеси.
  const groutRate = ((a + b) / (a * b)) * joint * thickness * cfg.grout.density_g_per_cm3;
  const groutKg = geom.floorArea * groutRate;
  const groutPacks = choosePacks(groutKg, cfg.grout.packs_kg);

  const items = [
    {
      id: "tile",
      name: "Плитка " + n(a) + " × " + n(b) + " мм",
      qty: count,
      unit: "плитка",
      note: n(perM2, 2) + " шт/м² при шве " + n(joint) + " мм, запас " +
        Math.round(cfg.reserve * 100) + " % на подрезку",
    },
    {
      id: "tile-adhesive",
      name: "Клей плиточный, мешок " + cfg.adhesive.bag_kg + " кг",
      qty: ceilUnits(adhesiveKg / cfg.adhesive.bag_kg),
      unit: "мешок",
      note: n(rate) + " кг/м² для плитки " + Math.max(a, b) + " мм = " + Math.round(adhesiveKg) + " кг",
    },
  ];

  groutPacks.picks.forEach((p, index) => {
    items.push({
      id: "tile-grout-" + p.size,
      name: "Затирка, упаковка " + n(p.size) + " кг",
      qty: p.count,
      unit: "упаковка",
      note: index > 0 ? "" : "шов " + n(joint) + " мм при толщине плитки " + n(thickness) +
        " мм: " + n(groutKg) + " кг",
    });
  });

  return items;
}

function adhesiveRate(side, rates) {
  for (const row of rates) {
    if (row.upToSide_mm === null || side <= row.upToSide_mm) return row.kg;
  }
  return rates[rates.length - 1].kg;
}

// ==== Пол: линолеум ====

export function linoleum(geom, params, data) {
  const cfg = data.linoleum;
  if (!(geom.width > 0) || !(geom.length > 0)) throw new CalcError("Не заданы размеры комнаты.");

  const widths = cfg.rollWidths_m;
  const widest = widths[widths.length - 1];
  const fitting = widths.find((w) => w >= geom.width);
  const width = fitting || widest;
  const length = ceilToStep(geom.length + cfg.lengthExtra_m, 0.1);

  const note =
    "отрез " + n(length) + " м на комнату " + n(geom.length) + " × " + n(geom.width) + " м" +
    (fitting
      ? ", без стыка"
      : ". Комната шире рулона " + n(widest) +
        " м — без стыка не обойтись, второй кусок считайте отдельно");

  return [
    {
      id: "linoleum",
      name: "Линолеум, ширина " + n(width) + " м",
      qty: round(length, 1),
      unit: "пог. м",
      note,
    },
  ];
}

// ==== Потолок: натяжной ====

/** Заказная позиция: материалов не считаем, даём замерщику площадь и периметр. */
export function stretchCeiling(geom) {
  if (!(geom.ceilingArea > 0)) throw new CalcError("Не заданы размеры комнаты.");
  return [
    {
      id: "stretch-canvas",
      name: "Полотно натяжного потолка",
      qty: round(geom.ceilingArea, 1),
      unit: "м²",
      note: "заказная позиция: цену считают за квадратный метр вместе с работой",
    },
    {
      id: "stretch-baguette",
      name: "Багет по периметру",
      qty: round(geom.perimeter, 1),
      unit: "пог. м",
      note: "по периметру комнаты, дверные проёмы не вычитаются",
    },
  ];
}

// ==== Прочее: плинтус, порожки ====

export function skirting(geom, params, data) {
  const plank = pick(params.plankLength, data.skirting.plankLength_m);
  if (!(geom.perimeterNet > 0)) throw new CalcError("Не заданы размеры комнаты.");

  const planks = ceilUnits(geom.perimeterNet / plank);
  return [
    {
      id: "skirting",
      name: "Плинтус, планка " + n(plank) + " м",
      qty: planks,
      unit: "планка",
      note: n(geom.perimeterNet) + " м периметра без дверных проёмов",
    },
    {
      id: "skirting-joints",
      name: "Соединители и заглушки",
      qty: planks,
      unit: "шт",
      note: "по числу планок; углы отдельно не считаем",
    },
  ];
}

export function thresholds(geom) {
  if (!(geom.doors > 0)) throw new CalcError("В комнате нет дверей — порожки не нужны.");
  return [
    {
      id: "threshold",
      name: "Порожек " + n(geom.doorWidth) + " м",
      qty: geom.doors,
      unit: "порожек",
      note: "по числу дверных проёмов",
    },
  ];
}

// Пустое поле означает «оставь по умолчанию», а не «ноль».
// Ноль допустим только там, где он осмыслен: раппорт, ширина шва.
function pick(value, fallback, zeroAllowed = false) {
  const number = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  if (!Number.isFinite(number)) return fallback;
  if (number < 0) return fallback;
  if (number === 0 && !zeroAllowed) return fallback;
  return number;
}
