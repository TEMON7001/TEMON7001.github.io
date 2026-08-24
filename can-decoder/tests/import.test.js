import { parseLog, summarize } from "../import/index.js";
import * as candump from "../import/candump.js";
import * as generic from "../import/generic.js";
import { makeCatalog } from "../core/catalog.js";
import { resolve } from "../core/resolve.js";
import { j1939 } from "../protocols/j1939/index.js";
import { bytesToHex } from "../core/frame.js";
import { suite, test, eq } from "./tiny.js";

export function run(seed) {
  const catalog = makeCatalog(seed);

  suite("import/candump.js — формат SocketCAN");

  test("запись со знаком # и меткой времени", () => {
    const got = candump.parseLine("(1755859200.123456) can0 0CF00400#FFA5A7E02EFFFFFF");
    eq(got.idHex, "0CF00400", "идентификатор");
    eq(got.dataHex, "FFA5A7E02EFFFFFF", "данные");
    eq(got.channel, "can0", "интерфейс");
    eq(got.time, 1755859200.123456, "метка времени");
  });

  test("запись с длиной в скобках", () => {
    const got = candump.parseLine("  can0  0CF00400   [8]  FF A5 A7 E0 2E FF FF FF");
    eq(got.idHex, "0CF00400", "идентификатор");
    eq(got.dataHex, "FFA5A7E02EFFFFFF", "данные");
    eq(got.time, null, "метки времени нет");
  });

  test("кадр без данных", () => {
    eq(candump.parseLine("can0 18EA00F9#").dataHex, "", "данных нет");
  });

  test("строка не из candump", () => {
    eq(candump.parseLine("просто текст"), null, "не разобрана");
    eq(candump.detect("0CF00400 FF A5"), false, "без интерфейса это не candump");
  });

  suite("import/generic.js — произвольный текст и csv");

  test("строка из идентификатора и байтов", () => {
    const got = generic.parseLine("0CF00400 FF A5 A7 E0 2E FF FF FF");
    eq(got.idHex, "0CF00400", "идентификатор");
    eq(got.dataHex, "FFA5A7E02EFFFFFF", "данные");
  });

  test("csv с временем, длиной и данными одним полем", () => {
    const got = generic.parseLine("1755859200.123,0CF00400,8,FFA5A7E02EFFFFFF");
    eq(got.idHex, "0CF00400", "идентификатор");
    eq(got.dataHex, "FFA5A7E02EFFFFFF", "данные");
    eq(got.time, 1755859200.123, "метка времени");
  });

  test("длина в скобках в данные не попадает", () => {
    eq(generic.parseLine("0CF00400 [8] FF A5 A7 E0 2E FF FF FF").dataHex, "FFA5A7E02EFFFFFF", "данные");
  });

  test("точка с запятой и приставка 0x", () => {
    const got = generic.parseLine("0x0CF00400;0xFF;0xA5");
    eq(got.idHex, "0CF00400", "идентификатор");
    eq(got.dataHex, "FFA5", "данные");
  });

  test("слитная запись без разделителей", () => {
    const got = generic.parseLine("0CF00400FFA5A7E02EFFFFFF");
    eq(got.idHex, "0CF00400", "идентификатор");
    eq(got.dataHex, "FFA5A7E02EFFFFFF", "данные");
  });

  test("заголовок csv пропускается", () => eq(generic.parseLine("Time,ID,DLC,Data"), null, "не разобран"));
  test("комментарий пропускается", () => eq(generic.parseLine("# комментарий"), null, "не разобран"));
  test("пустая строка", () => eq(generic.parseLine("   "), null, "не разобрана"));

  suite("import/index.js — разбор лога целиком");

  const LOG =
    "(1755859200.100000) can0 0CF00400#FFA5A7E02EFFFFFF\n" +
    "(1755859200.120000) can0 0CF00400#FF6464401FFFFFFF\n" +
    "(1755859200.140000) can0 18FEEE00#7D46FFFFFFFFFFFF\n" +
    "мусорная строка\n" +
    "(1755859200.160000) can0 0CF00421#FFA5A7E02EFFFFFF\n";

  test("формат определяется сам", () => eq(parseLog(LOG).format, "candump", "формат"));

  test("кадры разобраны, мусор посчитан", () => {
    const log = parseLog(LOG);
    eq(log.frames.length, 4, "кадров");
    eq(log.skipped, 1, "пропущено строк");
    eq(log.samples[0].number, 4, "номер строки с мусором");
  });

  test("время лога", () => {
    const log = parseLog(LOG);
    eq(Math.round(log.time.span * 1000), 60, "длительность в мс");
  });

  test("текстовый лог без интерфейса тоже разбирается", () => {
    const log = parseLog("0CF00400 FF A5 A7 E0 2E FF FF FF\n18FEEE00 7D 46 FF FF FF FF FF FF");
    eq(log.format, "текст", "формат");
    eq(log.frames.length, 2, "кадров");
  });

  test("байты кадра совпадают с исходными", () => {
    const log = parseLog(LOG);
    eq(bytesToHex(log.frames[0].bytes), "FF A5 A7 E0 2E FF FF FF", "байты");
  });

  suite("import/index.js — сводка по сообщениям");

  test("группировка по сообщению и адресу отправителя", () => {
    const groups = summarize(parseLog(LOG).frames, j1939);
    eq(groups.length, 3, "групп");
    eq(groups[0].pgn, 61444, "самое частое сообщение");
    eq(groups[0].count, 2, "кадров в группе");
    eq(groups[0].sa, 0, "адрес отправителя");
    eq(groups.some((g) => g.pgn === 61444 && g.sa === 0x21), true, "тот же PGN от другого блока — отдельная группа");
  });

  test("средний период между кадрами", () => {
    const groups = summarize(parseLog(LOG).frames, j1939);
    eq(Math.round(groups[0].periodMs), 20, "период в мс");
  });

  test("последний кадр группы доступен для разбора", () => {
    const groups = summarize(parseLog(LOG).frames, j1939);
    const result = resolve(groups[0].last, catalog, j1939);
    eq(result.id.pgn, 61444, "PGN");
    // Байты 40 1F при масштабе 0.125 дают ровно 1000 об/мин — считаем вручную,
    // чтобы тест проверял разбор, а не повторял его.
    eq(result.signals.find((s) => s.spn === 190).value, 1000, "обороты из последнего кадра");
  });

  suite("import — десять тысяч строк");

  test("лог на 10 000 строк разбирается быстрее чем за секунду", () => {
    const lines = [];
    for (let i = 0; i < 10000; i++) {
      const time = (1755859200 + i * 0.02).toFixed(6);
      const pgn = i % 3 === 0 ? "0CF00400" : i % 3 === 1 ? "18FEEE00" : "18FEF100";
      lines.push("(" + time + ") can0 " + pgn + "#FFA5A7E02EFFFFFF");
    }
    const text = lines.join("\n");

    const started = performance.now();
    const log = parseLog(text);
    const groups = summarize(log.frames, j1939);
    const spent = performance.now() - started;

    eq(log.frames.length, 10000, "кадров разобрано");
    eq(groups.length, 3, "групп");
    eq(log.skipped, 0, "пропущенных строк нет");
    // На телефоне процессор втрое медленнее настольного, поэтому запас берём большой.
    eq(spent < 1000, true, "разбор занял " + Math.round(spent) + " мс, ожидалось меньше 1000");
  });
}
