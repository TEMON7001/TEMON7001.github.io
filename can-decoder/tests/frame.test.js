import { parseFrame, bytesToHex, idToHex, FrameError } from "../core/frame.js";
import { suite, test, eq, eqBytes, throwsWith } from "./tiny.js";

suite("core/frame.js — формы записи");

const EXPECTED = { id: 0x18fee000, ext: true, dlc: 4, bytes: [0xff, 0xff, 0x82, 0x00] };

function checkSame(text, expected = EXPECTED) {
  const frame = parseFrame(text);
  eq(frame.id, expected.id, "id");
  eq(frame.ext, expected.ext, "признак 29 бит");
  eq(frame.dlc, expected.dlc, "dlc");
  eqBytes(frame.bytes, expected.bytes);
}

test("слитно, без разделителей: 18FEE000FFFF8200", () => checkSame("18FEE000FFFF8200"));
test("байты через пробел: 18FEE000 FF FF 82 00", () => checkSame("18FEE000 FF FF 82 00"));
test("формат candump с 0x: 0x18FEE000#FFFF8200", () => checkSame("0x18FEE000#FFFF8200"));
test("формат candump без 0x: 18FEE000#FF FF 82 00", () => checkSame("18FEE000#FF FF 82 00"));
test("нижний регистр и табы", () => checkSame("\t18fee000\tff ff 82 00  "));
test("запятые как разделитель", () => checkSame("18FEE000,FF,FF,82,00"));
test("дефисы как разделитель", () => checkSame("18FEE000-FF-FF-82-00"));
test("данные одним куском после пробела", () => checkSame("18FEE000 FFFF8200"));

suite("core/frame.js — длина идентификатора");

test("29 бит по длине записи: 18FEE000 без данных", () => {
  const frame = parseFrame("18FEE000");
  eq(frame.id, 0x18fee000, "id");
  eq(frame.ext, true, "признак 29 бит");
  eq(frame.dlc, 0, "dlc");
});

test("кадр без данных со знаком #", () => {
  const frame = parseFrame("18FEE000#");
  eq(frame.dlc, 0, "dlc");
  eq(frame.id, 0x18fee000, "id");
});

test("11 бит: 1F4 01 02", () => {
  const frame = parseFrame("1F4 01 02");
  eq(frame.id, 0x1f4, "id");
  eq(frame.ext, false, "признак 29 бит");
  eq(frame.dlc, 2, "dlc");
});

test("11 бит слитно: 1F40102 — нечётная длина, идентификатор трёхзначный", () => {
  const frame = parseFrame("1F40102");
  eq(frame.id, 0x1f4, "id");
  eq(frame.ext, false, "признак 29 бит");
  eqBytes(frame.bytes, [0x01, 0x02]);
});

test("граница 11 бит: 7FF — ещё стандартный", () => eq(parseFrame("7FF").ext, false, "признак 29 бит"));
test("граница 11 бит: 800 — уже расширенный", () => eq(parseFrame("800").ext, true, "признак 29 бит"));

test("полный кадр из контрольных примеров: 0CF00400", () => {
  const frame = parseFrame("0CF00400 FF A5 A7 E0 2E FF FF FF");
  eq(frame.id, 0x0cf00400, "id");
  eq(frame.dlc, 8, "dlc");
  eq(bytesToHex(frame.bytes), "FF A5 A7 E0 2E FF FF FF", "обратная запись байт");
});

suite("core/frame.js — ошибки");

test("введите кадр", () => throwsWith(() => parseFrame(""), "введите кадр"));
test("только пробелы — тоже пустой ввод", () => throwsWith(() => parseFrame("   \t "), "введите кадр"));
test("не строка вовсе", () => throwsWith(() => parseFrame(null), "введите кадр"));

test("недопустимый символ", () => throwsWith(() => parseFrame("18FEE000 FF G0"), "недопустимый символ"));
test("недопустимый символ в идентификаторе", () => throwsWith(() => parseFrame("18ZE0000 FF"), "недопустимый символ"));

test("не хватает половины байта", () => throwsWith(() => parseFrame("18FEE000 FF F"), "незавершённый байт"));
test("нечётная слитная запись длиннее идентификатора", () =>
  throwsWith(() => parseFrame("18FEE000FFF"), "незавершённый байт"));

test("слишком короткий ввод", () => throwsWith(() => parseFrame("1F"), "недостаточная длина"));
test("больше 8 байт", () =>
  throwsWith(() => parseFrame("18FEE000 00 01 02 03 04 05 06 07 08"), "не более 8"));
test("идентификатор длиннее 8 цифр", () =>
  throwsWith(() => parseFrame("118FEE000#FF"), "не более 8"));
test("два знака #", () => throwsWith(() => parseFrame("18FEE000#FF#00"), "более одного раза"));

test("ошибка — это FrameError, а не общий Error", () => {
  let caught = null;
  try {
    parseFrame("");
  } catch (error) {
    caught = error;
  }
  eq(caught instanceof FrameError, true, "тип ошибки");
});

test("строка из лога candump — подсказка про экран «Лог»", () =>
  throwsWith(() => parseFrame("can0  18FEE000   [8]  FF FF 82 00 00 00 00 00"), "строка из файла лога"));
test("строка с меткой времени — тоже подсказка", () =>
  throwsWith(() => parseFrame("(1755859200.123456) can0 18FEE000#FFFF8200"), "строка из файла лога"));
test("длина в скобках без интерфейса — подсказка", () =>
  throwsWith(() => parseFrame("18FEE000 [8] FF FF 82 00"), "строка из файла лога"));
test("буквы A–F в данных подсказку не вызывают", () => {
  const frame = parseFrame("18FEE000 FF00 82 00");
  eq(frame.dlc, 4, "dlc");
});

test("идентификатор из одних hex-букв за лог не принимаем", () => {
  const frame = parseFrame("FFF 01");
  eq(frame.id, 0xfff, "id");
  eq(frame.dlc, 1, "dlc");
});

suite("core/frame.js — вывод");

test("bytesToHex дополняет нулями", () => eq(bytesToHex([0x0, 0xa, 0xff]), "00 0A FF", "строка"));
test("idToHex для 29 бит — восемь цифр", () => eq(idToHex(0x18fee000, true), "18FEE000", "строка"));
test("idToHex для 11 бит — три цифры", () => eq(idToHex(0x1f4, false), "1F4", "строка"));
