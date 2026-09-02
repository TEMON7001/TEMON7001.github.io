// Сборка списка: выбранные работы превращаются в позиции по разделам.
// Главное, что здесь проверяется, — список не рассыпается от одной несчитаемой позиции
// и не молчит, когда считать нечего.

import { suite, test, eq } from "./tiny.js";
import { computeRoom, DEFAULT_ROOM } from "../core/room.js";
import { DEFAULT_WORKS } from "../core/works.js";
import { buildList, lineSum, totals, toText } from "../core/list.js";

export function run(data) {
  const g = computeRoom(DEFAULT_ROOM);
  const works = (patch) => ({ ...DEFAULT_WORKS, ...patch });
  const ids = (list) => list.items.map((i) => i.id);
  const section = (list, id) => list.sections.find((s) => s.id === id);

  suite("Список — пустые состояния");

  test("ничего не выбрано — ни позиций, ни ошибок", () => {
    const list = buildList(g, works(), {}, data);
    eq(list.chosen, 0, "выбранных работ");
    eq(list.items.length, 0, "позиций");
    eq(list.sections.every((s) => s.problems.length === 0), true, "сообщений об ошибках");
  });

  test("работы выбраны, но размеров нет — список не собирается и это видно", () => {
    const list = buildList(computeRoom({}), works({ walls: "wallpaper" }), {}, data);
    eq(list.needsRoom, true, "признак незаполненной комнаты");
    eq(list.chosen, 1, "выбранных работ");
    eq(list.items.length, 0, "позиций");
  });

  suite("Список — сборка");

  test("обои, ламинат, краска потолка и мелочёвка попадают в свои разделы", () => {
    const list = buildList(
      g,
      works({ walls: "wallpaper", floor: "laminate", ceiling: "paint", skirting: true, thresholds: true }),
      {},
      data
    );

    eq(section(list, "walls").items.map((i) => i.id).join(","), "wallpaper,wallpaper-glue", "стены");
    eq(section(list, "floor").items.map((i) => i.id).join(","), "laminate,underlay", "пол");
    eq(section(list, "ceiling").items.length, 2, "позиций потолка");
    eq(section(list, "other").items.map((i) => i.id).join(","), "skirting,skirting-joints,threshold", "прочее");
  });

  test("плоский список совпадает с суммой разделов", () => {
    const list = buildList(g, works({ walls: "paint", floor: "tile", ceiling: "stretch", primer: true }), {}, data);
    const fromSections = list.sections.reduce((sum, s) => sum + s.items.length, 0);
    eq(list.items.length, fromSections, "позиций");
    eq(new Set(ids(list)).size, list.items.length, "уникальных id");
  });

  test("параметры материала доходят до расчёта", () => {
    const list = buildList(g, works({ floor: "laminate" }), { laminate: { underlay: false } }, data);
    eq(ids(list).includes("underlay"), false, "подложка в списке");
    eq(ids(list).includes("laminate"), true, "ламинат в списке");
  });

  test("«ничего» ничего не добавляет", () => {
    const list = buildList(g, works({ walls: "none", floor: "none", ceiling: "none" }), {}, data);
    eq(list.items.length, 0, "позиций");
  });

  suite("Список — несчитаемые позиции");

  test("одна ошибка не рушит остальной список", () => {
    // Потолок 12 м: полоса обоев длиннее рулона, обои посчитать нельзя.
    const tall = computeRoom({ ...DEFAULT_ROOM, height: 12 });
    const list = buildList(tall, works({ walls: "wallpaper", floor: "laminate" }), {}, data);

    eq(section(list, "walls").items.length, 0, "позиций стен");
    eq(section(list, "walls").problems.length, 1, "сообщений по стенам");
    eq(section(list, "walls").problems[0].name, "Обои", "название работы в сообщении");
    eq(section(list, "walls").problems[0].message.includes("рулон"), true, "текст сообщения");
    eq(section(list, "floor").items.length, 2, "пол посчитан");
  });

  test("порожки без дверей — сообщение, а не пустая строка", () => {
    const noDoors = computeRoom({ ...DEFAULT_ROOM, doors: 0 });
    const list = buildList(noDoors, works({ thresholds: true }), {}, data);
    eq(section(list, "other").problems.length, 1, "сообщений");
    eq(list.items.length, 0, "позиций");
  });

  suite("Список — цены и итог");

  const full = () =>
    buildList(g, works({ walls: "wallpaper", floor: "laminate", ceiling: "paint" }), {}, data);

  test("сумма строки — количество на цену", () => {
    const list = full();
    const laminate = list.items.find((i) => i.id === "laminate");
    eq(lineSum(laminate, { laminate: "2400,50" }), 14403, "сумма");
  });

  test("пустая цена — это не ноль", () => {
    const list = full();
    const laminate = list.items.find((i) => i.id === "laminate");
    eq(lineSum(laminate, {}), null, "сумма без цены");
    eq(lineSum(laminate, { laminate: "" }), null, "сумма при пустом поле");
  });

  test("пробелы и запятая в цене не мешают", () => {
    const list = full();
    const item = list.items.find((i) => i.id === "wallpaper");
    eq(lineSum(item, { wallpaper: "1 200,50" }), item.qty * 1200.5, "сумма");
  });

  test("позиции без цены не ломают итог, но пересчитываются", () => {
    const list = full();
    const sums = totals(list.items, { laminate: "2000" }, {});
    eq(sums.total, 12000, "итог");
    eq(sums.priced, 1, "позиций с ценой");
    eq(sums.unpriced, list.items.length - 1, "позиций без цены");
  });

  test("«куплено» не меняет итог, но уменьшает остаток", () => {
    const list = full();
    const prices = { laminate: "2000", underlay: "900" };
    const sums = totals(list.items, prices, { underlay: true });
    eq(sums.total, 12900, "итог");
    eq(sums.remaining, 12000, "осталось купить");
  });

  test("цена без выбранной позиции в итог не попадает", () => {
    // В хранилище цены живут по id и переживают смену работ.
    const list = buildList(g, works({ floor: "laminate" }), {}, data);
    const sums = totals(list.items, { laminate: "2000", tile: "500" }, {});
    eq(sums.total, 12000, "итог");
  });

  suite("Список — текст для мессенджера");

  test("заголовок с размерами комнаты", () => {
    const text = toText(full(), g, {}, {});
    eq(text.split("\n")[0], "Ремонт комнаты 4,0 × 3,0 × 2,7", "первая строка");
  });

  test("разделы и позиции идут подряд", () => {
    const text = toText(full(), g, {}, {});
    eq(text.includes("СТЕНЫ"), true, "раздел стен");
    eq(text.includes("Обои 1,06 × 10,05 м — 5 рулонов"), true, "строка обоев");
    eq(text.includes("ПОЛ"), true, "раздел пола");
  });

  test("без цен итога в тексте нет, но сказано, что цен нет", () => {
    const text = toText(full(), g, {}, {});
    eq(text.includes("Итого"), false, "строка итога");
    eq(/\d+ позици\S* без цены/.test(text), true, "сообщение о позициях без цены");
  });

  test("с ценами появляется итог, купленное помечено", () => {
    const list = full();
    const text = toText(list, g, { laminate: "2000", underlay: "900" }, { underlay: true });
    // Разряды разделены неразрывным пробелом: в мессенджере «12» и «900»
    // не должны разъехаться по разным строкам.
    eq(text.includes("Итого: 12 900 ₽"), true, "итог");
    eq(text.includes("Подложка — 1 рулон (куплено)"), true, "отметка «куплено»");
    eq(text.includes("Осталось купить на"), true, "остаток");
  });

  test("в тексте нет разметки — только строки", () => {
    const text = toText(full(), g, { laminate: "2000" }, {});
    eq(/[<>*_#|]/.test(text), false, "символы разметки");
  });
}
