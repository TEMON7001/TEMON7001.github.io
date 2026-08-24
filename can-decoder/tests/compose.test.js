import { composeMessage, hintFor } from "../core/compose.js";
import { makeCatalog } from "../core/catalog.js";
import { parseFrame, bytesToHex } from "../core/frame.js";
import { resolve } from "../core/resolve.js";
import { j1939 } from "../protocols/j1939/index.js";
import { STATE } from "../core/signal.js";
import { suite, test, eq, close, eqBytes } from "./tiny.js";

export function run(seed) {
  const catalog = makeCatalog(seed);
  const eec1 = catalog.find(61444);
  const et1 = catalog.find(65262);

  suite("core/compose.js — сборка кадра");

  test("незаполненные байты остаются FF", () => {
    const { bytes } = composeMessage(eec1, new Map());
    eq(bytes.length, 8, "длина кадра");
    eq(bytesToHex(bytes), "FF FF FF FF FF FF FF FF", "байты");
  });

  test("одно значение занимает свои байты, остальные не трогает", () => {
    const { bytes, filled } = composeMessage(eec1, new Map([[190, 1500]]));
    eqBytes(bytes, [0xff, 0xff, 0xff, 0xe0, 0x2e, 0xff, 0xff, 0xff]);
    eq(filled.length, 1, "заполнен один параметр");
    eq(filled[0].raw, 12000, "сырое значение");
  });

  test("несколько значений в одном кадре", () => {
    const { bytes, filled } = composeMessage(eec1, new Map([[190, 1500], [513, 42], [512, 40]]));
    eqBytes(bytes, [0xff, 0xa5, 0xa7, 0xe0, 0x2e, 0xff, 0xff, 0xff]);
    eq(filled.length, 3, "заполнено параметров");
  });

  test("null означает «данные недоступны»", () => {
    const { bytes } = composeMessage(et1, new Map([[110, null]]));
    eq(bytes[0], 0xff, "байт остался FF");
  });

  test("значение вне диапазона — понятная ошибка, кадр собирается дальше", () => {
    const { bytes, filled, problems } = composeMessage(eec1, new Map([[190, 9000], [513, 42]]));
    eq(problems.length, 1, "одна ошибка");
    eq(problems[0].spn, 190, "номер параметра в ошибке");
    eq(problems[0].message.includes("8031.875"), true, "в ошибке назван рабочий потолок");
    eq(filled.length, 1, "остальные значения записаны");
    eq(bytes[2], 0xa7, "момент на месте");
  });

  test("служебный диапазон в кадр не попадает", () => {
    // 8100 об/мин помещается в 16 бит, но лежит выше рабочего потолка:
    // приёмник прочитает такое значение как «ошибка», а не как обороты.
    const { bytes, problems } = composeMessage(eec1, new Map([[190, 8100]]));
    eq(problems.length, 1, "ошибка есть");
    eq(bytes[3], 0xff, "байты остались незаполненными");
  });

  test("подсказка по диапазону", () => {
    const hint = hintFor(eec1.signals.find((s) => s.spn === 190));
    eq(hint.min, 0, "низ");
    eq(hint.max, 8031.875, "верх");
    eq(hint.unit, "об/мин", "единица");
  });

  suite("Критерий приёмки 4: прямой и обратный ход сходятся");

  // Собираем кадр, печатаем его строкой, разбираем как пользовательский ввод
  // и сверяем значения. Ровно этот путь проходит человек, нажимая «Проверить разбором».
  function roundTrip(message, values, options = {}) {
    const { bytes } = composeMessage(message, new Map(Object.entries(values).map(([k, v]) => [Number(k), v])));
    const id = j1939.buildId({ pgn: message.pgn, priority: options.priority || 6, sa: options.sa || 0 });
    const text = id.toString(16).toUpperCase().padStart(8, "0") + " " + bytesToHex(bytes);
    const result = resolve(parseFrame(text), catalog, j1939);
    return { text, result };
  }

  test("EEC1: обороты и момент возвращаются теми же", () => {
    const { result } = roundTrip(eec1, { 190: 1500, 513: 42, 512: 40 });
    eq(result.id.pgn, 61444, "PGN");
    eq(result.signals.find((s) => s.spn === 190).value, 1500, "обороты");
    eq(result.signals.find((s) => s.spn === 513).value, 42, "фактический момент");
    eq(result.signals.find((s) => s.spn === 512).value, 40, "требуемый момент");
  });

  test("ET1: температуры со смещением", () => {
    const { result } = roundTrip(et1, { 110: 85, 174: 30 });
    eq(result.signals.find((s) => s.spn === 110).value, 85, "температура охлаждающей жидкости");
    eq(result.signals.find((s) => s.spn === 174).value, 30, "температура топлива");
  });

  test("незаполненные параметры разбираются как «данные недоступны»", () => {
    const { result } = roundTrip(eec1, { 190: 1000 });
    eq(result.signals.find((s) => s.spn === 513).state, STATE.NOT_AVAILABLE, "состояние");
    eq(result.signals.find((s) => s.spn === 513).value, null, "значение");
  });

  test("приоритет и адрес отправителя доходят до разбора", () => {
    const { result } = roundTrip(eec1, { 190: 800 }, { priority: 3, sa: 0x21 });
    eq(result.id.priority, 3, "приоритет");
    eq(result.id.sa, 0x21, "адрес отправителя");
  });

  test("дробные значения возвращаются с точностью шага", () => {
    const { result } = roundTrip(eec1, { 190: 1234.625 });
    close(result.signals.find((s) => s.spn === 190).value, 1234.625, 0.0625, "обороты");
  });

  test("круг по всем числовым параметрам справочника", () => {
    for (const message of catalog.messages) {
      for (const signal of message.signals) {
        if (signal.type === "enum") continue;
        const limits = hintFor(signal);
        // Берём середину рабочего диапазона, округлённую до шага сигнала.
        const middle = Math.round((limits.min + limits.max) / 2 / limits.step) * limits.step;
        const { result } = roundTrip(message, { [signal.spn]: middle });
        const got = result.signals.find((s) => s.spn === signal.spn);
        eq(got !== undefined, true, "параметр SPN " + signal.spn + " найден при разборе");
        close(got.value, middle, limits.step, "SPN " + signal.spn + " в PGN " + message.pgn);
      }
    }
  });
}
