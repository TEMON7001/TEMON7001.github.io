import { parseId, buildId, parseRequestedPgn, pgnToHex, GLOBAL_ADDRESS, IdError } from "../protocols/j1939/id.js";
import { parseFrame } from "../core/frame.js";
import { suite, test, eq, throwsWith } from "./tiny.js";

suite("j1939/id.js — PDU2, широковещательные сообщения");

test("0CF00400 — EEC1: PGN 61444, приоритет 3, отправитель 0", () => {
  const got = parseId(0x0cf00400);
  eq(got.pgn, 61444, "PGN");
  eq(got.pgnHex, "0xF004", "PGN в hex");
  eq(got.priority, 3, "приоритет");
  eq(got.pf, 0xf0, "PF");
  eq(got.ps, 0x04, "PS");
  eq(got.sa, 0, "адрес отправителя");
  eq(got.da, null, "адреса получателя нет");
  eq(got.pduFormat, "PDU2", "тип PDU");
  eq(got.broadcast, true, "широковещательное");
});

test("18FEEE00 — ET1: PGN 65262", () => {
  const got = parseId(0x18feee00);
  eq(got.pgn, 65262, "PGN");
  eq(got.pgnHex, "0xFEEE", "PGN в hex");
  eq(got.priority, 6, "приоритет");
  eq(got.pduFormat, "PDU2", "тип PDU");
});

test("18FECA00 — DM1: PGN 65226", () => {
  eq(parseId(0x18feca00).pgn, 65226, "PGN");
});

test("PS входит в номер PGN только у PDU2", () => {
  // Один и тот же PF, разные PS — разные сообщения.
  eq(parseId(0x18fe0100).pgn, 65025, "PS = 01");
  eq(parseId(0x18fe0200).pgn, 65026, "PS = 02");
});

suite("j1939/id.js — PDU1, адресуемые сообщения");

test("18EA00F9 — запрос: PGN 59904, получатель 0, отправитель 249", () => {
  const got = parseId(0x18ea00f9);
  eq(got.pgn, 59904, "PGN");
  eq(got.pgnHex, "0xEA00", "PGN в hex");
  eq(got.pduFormat, "PDU1", "тип PDU");
  eq(got.da, 0, "адрес получателя");
  eq(got.sa, 249, "адрес отправителя");
  eq(got.priority, 6, "приоритет");
  eq(got.broadcast, false, "адресное, не широковещательное");
});

test("адрес получателя в номер PGN не попадает", () => {
  // Классическая ошибка: PS у PDU1 — это адрес, а не часть номера.
  eq(parseId(0x18ea00f9).pgn, parseId(0x18eaff21).pgn, "PGN не зависит от получателя");
  eq(parseId(0x18eaff21).da, 255, "получатель — глобальный адрес");
  eq(parseId(0x18eaff21).broadcast, true, "адрес 255 означает «всем»");
});

test("граница PF: 239 — адресуемое, 240 — широковещательное", () => {
  eq(parseId(0x18ef0a0b).pduFormat, "PDU1", "PF = EF");
  eq(parseId(0x18ef0a0b).pgn, 0xef00, "PGN без адреса");
  eq(parseId(0x18f00a0b).pduFormat, "PDU2", "PF = F0");
  eq(parseId(0x18f00a0b).pgn, 0xf00a, "PGN вместе с PS");
});

suite("j1939/id.js — страница данных");

test("DP = 1 поднимает номер PGN на 0x10000", () => {
  const got = parseId(0x19f00400);
  eq(got.dp, 1, "страница данных");
  eq(got.pgn, 0x1f004, "PGN");
  eq(got.pgnHex, "0x1F004", "PGN в hex");
});

test("EDP = 1: это уже не J1939-71, но разбирается без ошибки", () => {
  const got = parseId(0x1af00400);
  eq(got.dp, 2, "страница данных");
  eq(got.pgn, 0x2f004, "PGN");
});

suite("j1939/id.js — вместе с core/frame.js");

test("кадр из строки разбирается в PGN", () => {
  const frame = parseFrame("0CF00400 FF A5 A7 E0 2E FF FF FF");
  eq(parseId(frame).pgn, 61444, "PGN");
});

test("запрос PGN 65253: три байта, младший первым", () => {
  const frame = parseFrame("18EA00F9 E5 FE 00");
  const id = parseId(frame);
  eq(id.pgn, 59904, "PGN запроса");
  eq(id.da, 0, "кому адресован");
  eq(parseRequestedPgn(frame.bytes), 65253, "какой PGN запрашивают");
});

suite("j1939/id.js — сборка идентификатора");

test("PDU2 собирается обратно", () => {
  eq(buildId({ pgn: 61444, priority: 3, sa: 0 }), 0x0cf00400, "идентификатор");
});

test("PDU1 собирается вместе с адресом получателя", () => {
  eq(buildId({ pgn: 59904, priority: 6, sa: 249, da: 0 }), 0x18ea00f9, "идентификатор");
});

test("по умолчанию приоритет 6 и адрес «всем»", () => {
  const id = buildId({ pgn: 65262 });
  const back = parseId(id);
  eq(back.priority, 6, "приоритет");
  eq(back.sa, 0, "отправитель");
  eq(back.pgn, 65262, "PGN");
});

test("разбор и сборка сходятся на всех сообщениях справочника", () => {
  const pgns = [61444, 61443, 61445, 65262, 65263, 65265, 65266, 65253, 65257, 65269, 65270, 65276, 65226, 59904, 60416, 60160];
  for (const pgn of pgns) {
    const id = buildId({ pgn, priority: 6, sa: 0x21, da: 0x0a });
    const back = parseId(id);
    eq(back.pgn, pgn, "PGN " + pgn);
    eq(back.sa, 0x21, "отправитель для PGN " + pgn);
  }
});

suite("j1939/id.js — ошибки");

test("11-битный идентификатор", () =>
  throwsWith(() => parseId({ id: 0x1f4, ext: false }), "11-битный"));
test("больше 29 бит", () => throwsWith(() => parseId(0x20000000), "29 бит"));
test("не число", () => throwsWith(() => parseId("18FEE000"), "целым"));
test("отрицательный", () => throwsWith(() => parseId(-1), "целым"));
test("сборка с кривым PGN", () => throwsWith(() => buildId({ pgn: 999999 }), "PGN"));
test("сборка с кривым приоритетом", () =>
  throwsWith(() => buildId({ pgn: 61444, priority: 9 }), "Приоритет"));
test("сборка с кривым адресом", () => throwsWith(() => buildId({ pgn: 61444, sa: 300 }), "Адрес"));
test("запрос короче трёх байт", () => throwsWith(() => parseRequestedPgn([0xe5, 0xfe]), "три байта"));
test("ошибка — это IdError", () => {
  let caught = null;
  try {
    parseId(-1);
  } catch (error) {
    caught = error;
  }
  eq(caught instanceof IdError, true, "тип ошибки");
});

suite("j1939/id.js — вывод");

test("PGN в hex как в справочнике", () => {
  eq(pgnToHex(61444), "0xF004", "четыре цифры");
  eq(pgnToHex(65226), "0xFECA", "четыре цифры");
  eq(pgnToHex(0x1f004), "0x1F004", "пять цифр при DP = 1");
});

test("глобальный адрес — 255", () => eq(GLOBAL_ADDRESS, 255, "значение"));
