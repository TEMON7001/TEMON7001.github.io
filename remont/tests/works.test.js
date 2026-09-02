// Описание работ связывает экран «Работы» со списком закупки: у каждого варианта
// должен существовать расчёт и набор параметров. Опечатка здесь тихо выкидывает
// материал из списка — человек не увидит ни ошибки, ни позиции.

import { suite, test, eq } from "./tiny.js";
import { GROUPS, EXTRAS, PARAMS, DEFAULT_WORKS, chosen, at, paramValue, fieldOptions } from "../core/works.js";
import * as materials from "../core/materials.js";

export function run(data) {
  suite("Работы — целостность описания");

  const options = [...GROUPS.flatMap((g) => g.options), ...EXTRAS];

  test("у каждого варианта, кроме «ничего», есть расчёт в materials.js", () => {
    const broken = options.filter((o) => o.id !== "none" && typeof materials[o.calc] !== "function");
    eq(broken.length, 0, "вариантов без расчёта: " + broken.map((o) => o.id + " → " + o.calc).join(", "));
  });

  test("«ничего» ничего не считает", () => {
    const none = GROUPS.map((g) => g.options.find((o) => o.id === "none"));
    eq(none.length, GROUPS.length, "групп с вариантом «ничего»");
    eq(none.every((o) => !o.calc), true, "у «ничего» нет расчёта");
  });

  test("каждый набор параметров описан в PARAMS", () => {
    const broken = options.filter((o) => o.params && !PARAMS[o.params]);
    eq(broken.length, 0, "ссылок на несуществующие параметры: " + broken.map((o) => o.params).join(", "));
  });

  test("значения по умолчанию всех параметров есть в справочнике", () => {
    const broken = [];
    for (const [id, fields] of Object.entries(PARAMS)) {
      for (const field of fields) {
        if (at(data, field.def) === undefined) broken.push(id + "." + field.key + " → " + field.def);
      }
    }
    eq(broken.length, 0, "параметров без значения по умолчанию: " + broken.join(", "));
  });

  test("у каждого поля-списка есть варианты из справочника", () => {
    const broken = [];
    for (const [id, fields] of Object.entries(PARAMS)) {
      for (const field of fields) {
        if (field.kind === "select" && fieldOptions(field, data).length === 0) broken.push(id + "." + field.key);
      }
    }
    eq(broken.length, 0, "пустых списков: " + broken.join(", "));
  });

  test("значение по умолчанию есть среди вариантов списка", () => {
    const broken = [];
    for (const [id, fields] of Object.entries(PARAMS)) {
      for (const field of fields) {
        if (field.kind !== "select") continue;
        const values = fieldOptions(field, data).map((o) => String(o.value));
        if (!values.includes(String(at(data, field.def)))) broken.push(id + "." + field.key);
      }
    }
    eq(broken.length, 0, "значений по умолчанию вне списка: " + broken.join(", "));
  });

  test("на старте не выбрано ничего", () => {
    eq(DEFAULT_WORKS.walls, "none", "стены");
    eq(DEFAULT_WORKS.floor, "none", "пол");
    eq(DEFAULT_WORKS.ceiling, "none", "потолок");
    eq(EXTRAS.every((e) => DEFAULT_WORKS[e.id] === false), true, "мелочёвка выключена");
  });

  suite("Работы — выбор варианта");

  test("выбранный вариант находится по состоянию", () => {
    const walls = GROUPS.find((g) => g.id === "walls");
    eq(chosen({ walls: "wallpaper" }, walls).id, "wallpaper", "вариант");
    eq(chosen({ walls: "paint" }, walls).calc, "paintWalls", "расчёт");
  });

  test("неизвестный вариант в хранилище не роняет экран", () => {
    const walls = GROUPS.find((g) => g.id === "walls");
    eq(chosen({ walls: "мрамор" }, walls).id, "none", "вариант");
    eq(chosen({}, walls).id, "none", "вариант при пустом состоянии");
  });

  suite("Работы — значения параметров");

  test("нетронутый параметр берётся из справочника", () => {
    const field = PARAMS.wallpaper.find((f) => f.key === "rollWidth");
    eq(paramValue(undefined, field, data), 1.06, "ширина рулона");
    eq(paramValue({}, field, data), 1.06, "ширина рулона при пустых параметрах");
  });

  test("введённое значение перебивает справочник", () => {
    const field = PARAMS.wallpaper.find((f) => f.key === "rollWidth");
    eq(paramValue({ rollWidth: "0,53" }, field, data), "0,53", "ширина рулона");
  });

  test("очищенное поле возвращается к значению по умолчанию", () => {
    const field = PARAMS.laminate.find((f) => f.key === "packArea");
    eq(paramValue({ packArea: "" }, field, data), 2.13, "площадь упаковки");
  });

  test("выключенный флажок не путается с пустым полем", () => {
    const field = PARAMS.laminate.find((f) => f.key === "underlay");
    eq(paramValue({ underlay: false }, field, data), false, "подложка выключена");
    eq(paramValue({}, field, data), true, "подложка по умолчанию");
  });

  test("параметры доходят до расчёта в том же виде", () => {
    // Из полей приходят строки с запятой — расчёт обязан их понимать.
    const geom = { perimeterNet: 13.1, height: 2.7, floorArea: 12 };
    const items = materials.wallpaper(geom, { rollWidth: "0,53", rapport: "0" }, data);
    eq(items[0].qty, 9, "рулонов при ширине 0,53");
  });
}
