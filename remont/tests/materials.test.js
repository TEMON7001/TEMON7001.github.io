// Контрольная таблица из ТЗ (T10) на комнате 4,0 × 3,0 × 2,7.
// Первый тест — критический: если обои дают 4 рулона вместо 5, ядро считает
// по площади, и чинить надо ядро, а не тест.

import { suite, test, eq, close, throwsWith } from "./tiny.js";
import { computeRoom, DEFAULT_ROOM } from "../core/room.js";
import * as m from "../core/materials.js";

export function run(data) {
  const g = computeRoom(DEFAULT_ROOM);
  const byId = (items, id) => items.find((i) => i.id === id);

  suite("Обои — расчёт по полосам");

  test("5 рулонов 1,06 × 10,05 без раппорта", () => {
    const plan = m.wallpaperPlan(g, {}, data);
    eq(plan.strips, 13, "полос");
    eq(plan.perRoll, 3, "полос из рулона");
    eq(plan.rolls, 5, "рулонов");
  });

  test("расчёт по площади дал бы 4 рулона — так считать нельзя", () => {
    // 33,81 м² / (1,06 × 10,05) = 3,17 → 4. Правильный ответ 5.
    const byArea = Math.ceil(g.wallsNet / (1.06 * 10.05));
    eq(byArea, 4, "рулонов по площади");
    eq(m.wallpaperPlan(g, {}, data).rolls, 5, "рулонов по полосам");
  });

  test("узкий рулон 0,53 — полос вдвое больше", () => {
    const plan = m.wallpaperPlan(g, { rollWidth: 0.53 }, data);
    eq(plan.strips, 25, "полос");
    eq(plan.rolls, 9, "рулонов");
  });

  test("раппорт удлиняет полосу и добавляет рулоны", () => {
    const plain = m.wallpaperPlan(g, { rapport: 0 }, data);
    const repeat = m.wallpaperPlan(g, { rapport: 0.64 }, data);
    eq(repeat.rolls >= plain.rolls, true, "рулонов с раппортом не меньше");
    close(repeat.stripHeight, 2.7 + 0.1 + 0.64, 1e-9, "высота полосы");
  });

  test("потолок 3,2 м с раппортом 0,64: две полосы из рулона, расчёт не падает", () => {
    const tall = computeRoom({ ...DEFAULT_ROOM, height: 3.2 });
    const plan = m.wallpaperPlan(tall, { rapport: 0.64 }, data);
    eq(plan.perRoll, 2, "полос из рулона");
    eq(Number.isFinite(plan.rolls), true, "рулонов — число");
    eq(plan.rolls > 0, true, "рулонов больше нуля");
  });

  test("высота 5 м считается, но предупреждает об отходе", () => {
    const tall = computeRoom({ ...DEFAULT_ROOM, height: 5 });
    const plan = m.wallpaperPlan(tall, {}, data);
    eq(plan.perRoll, 1, "полос из рулона");
    eq(Number.isFinite(plan.rolls), true, "рулонов — число");
    const item = byId(m.wallpaper(tall, {}, data), "wallpaper");
    eq(item.note.includes("одна полоса"), true, "в примечании сказано про одну полосу");
  });

  test("полоса длиннее рулона — внятное сообщение, а не ноль", () => {
    const veryTall = computeRoom({ ...DEFAULT_ROOM, height: 10 });
    throwsWith(() => m.wallpaperPlan(veryTall, {}, data), "не выходит ни одной полосы");
  });

  test("клей считается от стены под обоями, а не от купленных рулонов", () => {
    const glue = byId(m.wallpaper(g, {}, data), "wallpaper-glue");
    eq(glue.qty, 2, "пачек клея");
  });

  suite("Пол");

  test("ламинат: 6 упаковок по 2,13 м², прямая укладка", () => {
    const item = byId(m.laminate(g, {}, data), "laminate");
    eq(item.qty, 6, "упаковок");
    eq(item.unit, "упаковка", "единица");
  });

  test("диагональная укладка добавляет упаковку", () => {
    const straight = byId(m.laminate(g, { laying: "straight" }, data), "laminate").qty;
    const diagonal = byId(m.laminate(g, { laying: "diagonal" }, data), "laminate").qty;
    eq(straight, 6, "упаковок прямо");
    eq(diagonal, 7, "упаковок по диагонали");
  });

  test("подложка: 1 рулон 15 м²", () => {
    eq(byId(m.laminate(g, {}, data), "underlay").qty, 1, "рулонов");
  });

  test("подложку можно отключить", () => {
    eq(byId(m.laminate(g, { underlay: false }, data), "underlay"), undefined, "позиция подложки");
  });

  test("плитка 300 × 300 при шве 2 мм: 145 штук с запасом 10 %", () => {
    eq(byId(m.tile(g, {}, data), "tile").qty, 145, "плиток");
  });

  test("плиточный клей берётся по большей стороне плитки", () => {
    const small = byId(m.tile(g, { sideA: 150, sideB: 150 }, data), "tile-adhesive").note;
    const big = byId(m.tile(g, { sideA: 600, sideB: 600 }, data), "tile-adhesive").note;
    eq(small.startsWith("3,5"), true, "норма для мелкой плитки");
    eq(big.startsWith("6"), true, "норма для крупной плитки");
  });

  test("мусор в размере плитки — берётся значение по умолчанию, а не деление на ноль", () => {
    const item = byId(m.tile(g, { sideA: -5, sideB: "" }, data), "tile");
    eq(item.name, "Плитка 300 × 300 мм", "размер плитки");
    eq(item.qty, 145, "плиток");
  });

  test("плитка при нулевой площади пола — сообщение, а не ноль", () => {
    throwsWith(() => m.tile(computeRoom({}), {}, data), "размеры комнаты");
  });

  test("линолеум: рулон 3 м, отрез 4,1 м, без стыка", () => {
    const item = byId(m.linoleum(g, {}, data), "linoleum");
    eq(item.name.includes("3 м"), true, "ширина рулона");
    close(item.qty, 4.1, 1e-9, "погонных метров");
    eq(item.note.includes("без стыка"), true, "примечание про стык");
  });

  test("комната шире 4 м — берём максимальную ширину и предупреждаем о стыке", () => {
    const wide = computeRoom({ ...DEFAULT_ROOM, width: 4.5 });
    const item = byId(m.linoleum(wide, {}, data), "linoleum");
    eq(item.name.includes("4 м"), true, "ширина рулона");
    eq(item.note.includes("стыка не обойтись"), true, "предупреждение о стыке");
  });

  suite("Потолок и стены");

  test("краска потолка 2,88 л — банки 2,7 + 0,9", () => {
    const items = m.paint(g.ceilingArea, {}, data, "ceiling");
    eq(items.length, 2, "позиций");
    eq(items[0].name.includes("2,7 л"), true, "первая банка");
    eq(items[0].qty, 1, "штук");
    eq(items[1].name.includes("0,9 л"), true, "вторая банка");
    eq(items[1].qty, 1, "штук");
  });

  test("краска стен считается от площади за вычетом проёмов", () => {
    const items = m.paint(g.wallsNet, {}, data, "walls");
    eq(items[0].note.includes("33,8 м²"), true, "в примечании площадь стен");
  });

  test("один слой вместо двух: 1,44 л — две банки 0,9, а не одна 2,7", () => {
    // Банка 2,7 покрыла бы объём одной штукой, но излишек был бы 1,26 л против 0,36.
    const one = m.paint(g.ceilingArea, { coats: 1 }, data, "ceiling");
    eq(one.length, 1, "разных фасовок");
    eq(one[0].name.includes("0,9 л"), true, "фасовка");
    eq(one[0].qty, 2, "банок");
  });

  test("штукатурка и шпатлёвка стен", () => {
    const items = m.plaster(g, {}, data);
    eq(byId(items, "plaster").qty, 11, "мешков штукатурки");
    eq(byId(items, "putty").qty, 3, "мешков шпатлёвки");
  });

  test("натяжной потолок: площадь полотна и багет по периметру", () => {
    const items = m.stretchCeiling(g);
    close(byId(items, "stretch-canvas").qty, 12, 1e-9, "м² полотна");
    close(byId(items, "stretch-baguette").qty, 14, 1e-9, "пог. м багета");
  });

  suite("Прочее");

  test("плинтус: 6 планок по 2,5 м", () => {
    eq(byId(m.skirting(g, {}, data), "skirting").qty, 6, "планок");
  });

  test("соединители — по числу планок", () => {
    const items = m.skirting(g, {}, data);
    eq(byId(items, "skirting-joints").qty, byId(items, "skirting").qty, "соединителей");
  });

  test("порожки — по числу дверных проёмов", () => {
    eq(m.thresholds(g)[0].qty, 1, "порожков");
  });

  test("грунтовка стен: 3,38 л", () => {
    const items = m.primerFor(g.wallsNet, data);
    eq(items[0].note.includes("3,38 л"), true, "объём в примечании");
  });

  test("если потолок красится — грунтуем и его", () => {
    const walls = m.primer(g, {}, data, { ceiling: "none" })[0];
    const both = m.primer(g, {}, data, { ceiling: "paint" })[0];
    eq(walls.note.includes("33,8 м²"), true, "площадь только стен");
    eq(both.note.includes("45,8 м²"), true, "площадь стен и потолка");
    eq(both.note.includes("стены и потолок"), true, "пояснение в примечании");
  });

  suite("Единицы покупки");

  test("все количества целые, кроме рулонных материалов в погонных метрах", () => {
    const items = [
      ...m.wallpaper(g, {}, data),
      ...m.laminate(g, {}, data),
      ...m.tile(g, {}, data),
      ...m.plaster(g, {}, data),
      ...m.skirting(g, {}, data),
      ...m.paint(g.ceilingArea, {}, data, "ceiling"),
    ];
    const fractional = items.filter((i) => !Number.isInteger(i.qty));
    eq(fractional.length, 0, "позиций с дробным количеством: " + fractional.map((i) => i.name).join(", "));
  });

  test("ни одна позиция не даёт NaN и не остаётся без единицы", () => {
    const items = [
      ...m.wallpaper(g, {}, data),
      ...m.laminate(g, {}, data),
      ...m.linoleum(g, {}, data),
      ...m.tile(g, {}, data),
      ...m.plaster(g, {}, data),
      ...m.stretchCeiling(g),
      ...m.skirting(g, {}, data),
      ...m.thresholds(g),
      ...m.primerFor(g.wallsNet, data),
      ...m.paint(g.wallsNet, {}, data, "walls"),
    ];
    const broken = items.filter((i) => !Number.isFinite(i.qty) || i.qty <= 0 || !i.id || !i.name || !i.unit);
    eq(broken.length, 0, "битых позиций: " + broken.map((i) => i.id || "без id").join(", "));
  });

  test("id позиций уникальны — по ним хранятся цены", () => {
    const items = [
      ...m.wallpaper(g, {}, data),
      ...m.laminate(g, {}, data),
      ...m.tile(g, {}, data),
      ...m.skirting(g, {}, data),
      ...m.paint(g.wallsNet, {}, data, "walls"),
      ...m.paint(g.ceilingArea, {}, data, "ceiling"),
    ];
    const ids = items.map((i) => i.id);
    eq(new Set(ids).size, ids.length, "уникальных id из " + ids.length);
  });
}
