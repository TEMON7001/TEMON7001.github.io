// Геометрия контрольной комнаты из ТЗ: 4,0 × 3,0 × 2,7, дверь 0,9 × 2,1, окно 1,5 × 1,4.
// Все остальные тесты опираются на эти числа, поэтому проверяются они первыми.

import { suite, test, eq, close } from "./tiny.js";
import { computeRoom, DEFAULT_ROOM } from "../core/room.js";

suite("Комната");

const g = computeRoom(DEFAULT_ROOM);

test("периметр 14,0 м", () => close(g.perimeter, 14.0, 1e-9, "P"));
test("площадь пола 12,0 м²", () => close(g.floorArea, 12.0, 1e-9, "S пола"));
test("площадь потолка равна площади пола", () => close(g.ceilingArea, g.floorArea));
test("стены брутто 37,8 м²", () => close(g.wallsGross, 37.8, 1e-9, "S стен брутто"));
test("проёмы 3,99 м²", () => close(g.openingsArea, 3.99, 1e-9, "S проёмов"));
test("стены за вычетом проёмов 33,81 м²", () => close(g.wallsNet, 33.81, 1e-9, "S стен"));
test("периметр без дверей 13,1 м", () => close(g.perimeterNet, 13.1, 1e-9, "P чистый"));
test("замечаний на нормальной комнате нет", () => eq(g.warnings.length, 0, "число замечаний"));

suite("Комната — крайние случаи");

test("пустые поля не дают NaN", () => {
  const empty = computeRoom({});
  eq(empty.valid, false, "признак заполненности");
  eq(Number.isFinite(empty.wallsNet), true, "S стен конечна");
  eq(empty.wallsNet, 0, "S стен");
});

test("текст вместо числа не ломает расчёт", () => {
  const broken = computeRoom({ ...DEFAULT_ROOM, length: "четыре" });
  eq(broken.floorArea, 0, "S пола");
  eq(broken.warnings.length > 0, true, "есть замечание");
});

test("запятая в поле читается как десятичный разделитель", () => {
  const comma = computeRoom({ ...DEFAULT_ROOM, height: "2,7" });
  close(comma.wallsGross, 37.8, 1e-9, "S стен брутто");
});

test("проёмы больше стен не дают отрицательной площади", () => {
  const odd = computeRoom({ ...DEFAULT_ROOM, windows: 20 });
  eq(odd.wallsNet, 0, "S стен");
  eq(odd.warnings.length > 0, true, "есть замечание");
});

test("двери шире периметра не дают отрицательного периметра", () => {
  const odd = computeRoom({ ...DEFAULT_ROOM, doors: 30 });
  eq(odd.perimeterNet, 0, "P чистый");
  eq(odd.warnings.length > 0, true, "есть замечание");
});

test("высота 5 м проходит, но с замечанием", () => {
  const tall = computeRoom({ ...DEFAULT_ROOM, height: 5.2 });
  eq(Number.isFinite(tall.wallsNet), true, "S стен конечна");
  eq(tall.warnings.length > 0, true, "есть замечание");
});
