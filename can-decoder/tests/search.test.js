import { buildIndex, search } from "../core/search.js";
import { makeCatalog } from "../core/catalog.js";
import { makeEntries, ENTRY } from "../protocols/j1939/entries.js";
import { suite, test, eq } from "./tiny.js";

export function run(seed, faultCodes) {
  const catalog = makeCatalog(seed);
  const index = buildIndex(makeEntries(catalog, faultCodes));
  const find = (query) => search(index, query);
  const titles = (query) => find(query).map((e) => e.title);

  suite("core/search.js — запросы из критерия приёмки");

  test("61444 — номер PGN в десятичном виде", () => {
    const first = find("61444")[0];
    eq(first.kind, ENTRY.MESSAGE, "тип записи");
    eq(first.title, "EEC1", "сообщение");
  });

  test("F004 — тот же номер в hex", () => {
    const first = find("F004")[0];
    eq(first.kind, ENTRY.MESSAGE, "тип записи");
    eq(first.data.pgn, 61444, "PGN");
  });

  test("0xF004 — с приставкой тоже находится", () => eq(find("0xF004")[0].data.pgn, 61444, "PGN"));

  test("EEC1 — по акрониму", () => eq(find("EEC1")[0].data.pgn, 61444, "PGN"));

  test("eec1 — регистр не важен", () => eq(find("eec1")[0].data.pgn, 61444, "PGN"));

  test("оборот — неполное слово из названия", () => {
    const found = find("оборот");
    eq(found.some((e) => e.kind === ENTRY.SIGNAL && e.data.signal.spn === 190), true, "обороты двигателя найдены");
  });

  test("SPN 190 — номер параметра с приставкой", () => {
    const first = find("SPN 190")[0];
    eq(first.kind, ENTRY.SIGNAL, "тип записи");
    eq(first.data.signal.spn, 190, "SPN");
  });

  test("190 — номер параметра без приставки", () => {
    eq(find("190").some((e) => e.kind === ENTRY.SIGNAL && e.data.signal.spn === 190), true, "найден");
  });

  test("FMI 3 — код отказа", () => {
    const first = find("FMI 3")[0];
    eq(first.kind, ENTRY.FAULT, "тип записи");
    eq(first.data.fmi, 3, "код");
    eq(first.data.description.includes("апряжение"), true, "описание про напряжение");
  });

  suite("core/search.js — поведение поиска");

  test("пустой запрос ничего не возвращает", () => eq(find("").length, 0, "результатов"));
  test("пробелы — тоже пустой запрос", () => eq(find("   ").length, 0, "результатов"));

  test("все слова запроса должны найтись", () => {
    eq(find("EEC1 обороты").length > 0, true, "оба слова из одной записи");
    eq(find("EEC1 температура").length, 0, "слова из разных записей не совпадают");
  });

  test("точное совпадение выше частичного", () => {
    // 190 есть и как SPN, и внутри других номеров — точный SPN должен быть первым.
    eq(find("190")[0].data.signal.spn, 190, "первый результат");
  });

  test("служебные сообщения тоже ищутся", () => {
    const found = find("TP.CM");
    eq(found[0].data.pgn, 60416, "PGN");
    eq(found[0].data.kind, "service", "помечено служебным");
  });

  test("поиск по единице измерения", () => {
    eq(find("об/мин").some((e) => e.data.signal && e.data.signal.spn === 190), true, "обороты найдены");
  });

  test("несуществующий запрос", () => eq(find("ксенон").length, 0, "результатов"));

  test("в выдаче нет дублей одной записи", () => {
    const found = find("двигател");
    eq(new Set(found.map((e) => e.id)).size, found.length, "все записи различны");
  });

  suite("j1939/entries.js — состав записей");

  test("записи покрывают весь справочник", () => {
    const entries = makeEntries(catalog, faultCodes);
    const messages = entries.filter((e) => e.kind === ENTRY.MESSAGE).length;
    const signals = entries.filter((e) => e.kind === ENTRY.SIGNAL).length;
    const faults = entries.filter((e) => e.kind === ENTRY.FAULT).length;
    eq(messages, 18, "сообщений вместе со служебными");
    eq(signals, 80, "параметров");
    eq(faults, 32, "кодов отказов");
  });

  test("у каждой записи есть заголовок и слова поиска", () => {
    const entries = makeEntries(catalog, faultCodes);
    eq(entries.every((e) => e.title && e.terms.length > 0), true, "заполнено");
  });

  test("titles возвращает строки", () => eq(typeof titles("EEC1")[0], "string", "тип"));
}
