// Округления и подбор фасовок. Здесь решается, сколько штук человек унесёт из магазина.

import { suite, test, eq, close } from "./tiny.js";
import { ceilUnits, floorUnits, ceilToStep, choosePacks } from "../core/units.js";

suite("Округления");

test("вверх до целой упаковки", () => eq(ceilUnits(5.915), 6, "упаковок"));
test("ровное деление не даёт лишней упаковки", () => eq(ceilUnits(12 / 2), 6, "упаковок"));
test("грязь двоичной арифметики не добавляет упаковку", () => eq(ceilUnits(0.1 + 0.2 + 0.7), 1, "упаковок"));
test("полос из рулона — вниз", () => eq(floorUnits(10.05 / 2.8), 3, "полос"));
test("ровное деление вниз не теряет полосу", () => eq(floorUnits(9 / 3), 3, "полос"));
test("погонные метры — вверх до 0,1", () => close(ceilToStep(4.02, 0.1), 4.1, 1e-9, "м"));

suite("Подбор фасовок");

test("2,88 л из ряда 0,9 / 2,7 / 9 — это 2,7 + 0,9", () => {
  const chosen = choosePacks(2.88, [0.9, 2.7, 9]);
  close(chosen.total, 3.6, 1e-9, "всего литров");
  eq(chosen.picks.length, 2, "разных фасовок");
  eq(chosen.picks[0].size, 2.7, "крупная банка");
  eq(chosen.picks[0].count, 1, "штук крупных");
  eq(chosen.picks[1].size, 0.9, "мелкая банка");
  eq(chosen.picks[1].count, 1, "штук мелких");
});

test("при равном излишке берётся меньше банок", () => {
  // 0,9 × 4 даёт те же 3,6 л — но четыре банки вместо двух.
  const chosen = choosePacks(2.88, [0.9, 2.7, 9]);
  const cans = chosen.picks.reduce((sum, p) => sum + p.count, 0);
  eq(cans, 2, "всего банок");
});

test("одна большая банка не навязывается", () => {
  const chosen = choosePacks(3.0, [0.9, 2.7, 9]);
  eq(chosen.picks.some((p) => p.size === 9), false, "есть банка 9 л");
});

test("малый объём — минимальная фасовка", () => {
  const chosen = choosePacks(0.4, [0.9, 2.7, 9]);
  eq(chosen.picks.length, 1, "разных фасовок");
  eq(chosen.picks[0].size, 0.9, "фасовка");
  eq(chosen.picks[0].count, 1, "штук");
});

test("нулевой объём — пустой набор", () => {
  const chosen = choosePacks(0, [0.9, 2.7, 9]);
  eq(chosen.picks.length, 0, "разных фасовок");
  eq(chosen.total, 0, "всего литров");
});

test("точное попадание в фасовку не берёт лишнего", () => {
  const chosen = choosePacks(2.7, [0.9, 2.7, 9]);
  eq(chosen.picks.length, 1, "разных фасовок");
  eq(chosen.picks[0].size, 2.7, "фасовка");
  close(chosen.surplus, 0, 1e-9, "излишек");
});

test("большой объём считается и не зависает", () => {
  const chosen = choosePacks(500, [0.9, 2.7, 9]);
  eq(chosen.total >= 500, true, "объём покрыт");
  eq(chosen.surplus < 0.9, true, "излишек меньше мелкой банки");
});
