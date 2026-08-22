import { resolve, KIND } from "../core/resolve.js";
import { makeCatalog } from "../core/catalog.js";
import { parseFrame } from "../core/frame.js";
import { j1939 } from "../protocols/j1939/index.js";
import { STATE } from "../core/signal.js";
import { suite, test, eq } from "./tiny.js";

export function run(seed, vectors) {
  const catalog = makeCatalog(seed);
  const decode = (text) => resolve(parseFrame(text), catalog, j1939);

  suite("core/resolve.js — контрольные примеры coworker'а");

  for (const vector of vectors.vectors) {
    if (!vector.expect.signals) continue;
    test(vector.name, () => {
      const got = decode(vector.id + " " + vector.data);
      eq(got.kind, KIND.MESSAGE, "сообщение распознано");
      eq(got.id.pgn, vector.expect.pgn, "PGN");
      if (vector.expect.priority !== undefined) eq(got.id.priority, vector.expect.priority, "приоритет");
      if (vector.expect.sa !== undefined) eq(got.id.sa, vector.expect.sa, "адрес отправителя");
      if (vector.expect.pdu !== undefined) eq(got.id.pduFormat, vector.expect.pdu, "тип PDU");
      for (const [spn, expected] of Object.entries(vector.expect.signals)) {
        const signal = got.signals.find((s) => String(s.spn) === spn);
        eq(signal !== undefined, true, "сигнал SPN " + spn + " найден");
        eq(signal.value, expected, "значение SPN " + spn);
        eq(signal.state, STATE.OK, "состояние SPN " + spn);
      }
    });
  }

  const allFF = vectors.vectors.find((v) => v.expect.signals_state === "not_available");
  test(allFF.name, () => {
    const got = decode(allFF.id + " " + allFF.data);
    eq(got.id.pgn, allFF.expect.pgn, "PGN");
    eq(got.signals.length > 0, true, "сигналы разобраны");
    eq(got.signals.every((s) => s.state === STATE.NOT_AVAILABLE), true, "все недоступны");
    eq(got.signals.every((s) => s.value === null), true, "значений нет");
  });

  const request = vectors.vectors.find((v) => v.expect.requested_pgn !== undefined);
  test(request.name, () => {
    const frame = parseFrame(request.id + " " + request.data);
    const got = resolve(frame, catalog, j1939);
    eq(got.kind, KIND.SERVICE, "служебное сообщение");
    eq(got.id.pgn, request.expect.pgn, "PGN");
    eq(got.id.da, request.expect.da, "получатель");
    eq(got.id.sa, request.expect.sa, "отправитель");
    eq(j1939.parseRequestedPgn(frame.bytes), request.expect.requested_pgn, "какой PGN запрашивают");
  });

  suite("core/resolve.js — что делаем с незнакомым");

  test("незнакомый PGN: сырые байты и никаких выдуманных значений", () => {
    // Тот самый 18FEE000 из ТЗ: это PGN 65248, которого в справочнике нет.
    const got = decode("18FEE000 FF FF 82 00 00 00 00 00");
    eq(got.kind, KIND.UNKNOWN, "не распознано");
    eq(got.id.pgn, 65248, "PGN всё равно посчитан");
    eq(got.message, null, "записи в справочнике нет");
    eq(got.signals.length, 0, "сигналов не придумываем");
  });

  test("служебный PGN узнаётся и подписывается", () => {
    const id = j1939.buildId({ pgn: 60416, priority: 7, sa: 0x21, da: 0x0a });
    const got = resolve(parseFrame(id.toString(16) + " 20 09 00 02 FF CA FE 00"), catalog, j1939);
    eq(got.kind, KIND.SERVICE, "служебное");
    eq(got.message.acronym, "TP.CM", "подпись из справочника");
    eq(got.signals.length, 0, "данные не разбираем");
  });

  suite("core/resolve.js — короткие и длинные кадры");

  test("короткий кадр разбирается насколько хватает байт", () => {
    const got = decode("0CF00400 FF A5 A7");
    eq(got.signals.some((s) => s.spn === 512), true, "сигнал во втором байте разобран");
    eq(got.skipped.some((s) => s.spn === 190), true, "обороты пропущены");
    eq(got.lengthMismatch.expected, 8, "ожидалось байт");
    eq(got.lengthMismatch.got, 3, "получено байт");
  });

  test("полный кадр расхождения по длине не даёт", () => {
    eq(decode("0CF00400 FF A5 A7 E0 2E FF FF FF").lengthMismatch, null, "расхождения нет");
  });

  suite("core/resolve.js — раскладка байтов и подписи");

  test("видно, какой байт какому сигналу принадлежит", () => {
    const got = decode("0CF00400 FF A5 A7 E0 2E FF FF FF");
    eq(got.byteOwners[3].includes(190), true, "четвёртый байт — обороты");
    eq(got.byteOwners[4].includes(190), true, "пятый байт — тоже обороты");
    eq(got.byteOwners[2].includes(513), true, "третий байт — момент");
    const rpm = got.signals.find((s) => s.spn === 190);
    eq(rpm.bytes.join(","), "3,4", "обороты занимают два байта");
  });

  test("у перечисления берётся подпись из справочника", () => {
    const got = decode("18FECA00 10 FF BE 00 03 02 FF FF");
    const red = got.signals.find((s) => s.spn === 623);
    eq(red.label, "включена", "красная лампа");
    const amber = got.signals.find((s) => s.spn === 624);
    eq(amber.label, "выключена", "янтарная лампа");
  });

  test("DM1 помечен своим разборщиком", () => {
    const got = decode("18FECA00 10 FF BE 00 03 02 FF FF");
    eq(got.handler, "dm1", "обработчик");
    eq(got.kind, KIND.MESSAGE, "сообщение распознано");
  });

  test("единицы измерения доходят до результата", () => {
    const rpm = decode("0CF00400 FF A5 A7 E0 2E FF FF FF").signals.find((s) => s.spn === 190);
    eq(rpm.unit, "об/мин", "единица");
    eq(rpm.name, "Обороты двигателя", "название");
  });
}
