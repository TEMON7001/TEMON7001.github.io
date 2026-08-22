import { extract, pack, range, STATE, SignalError } from "../core/signal.js";
import { suite, test, eq, eqBytes, close, throwsWith } from "./tiny.js";

// Описания взяты из seed-справочника — чтобы тесты проверяли те же числа,
// с которыми потом будет работать приложение.
const SPN_190 = { start_bit: 24, length_bits: 16, byte_order: "little", scale: 0.125, offset: 0, min: 0, max: 8031.875, message_length: 8 };
const SPN_513 = { start_bit: 16, length_bits: 8, byte_order: "little", scale: 1, offset: -125, min: -125, max: 125, message_length: 8 };
const SPN_512 = { start_bit: 8, length_bits: 8, byte_order: "little", scale: 1, offset: -125, min: -125, max: 125, message_length: 8 };
const SPN_110 = { start_bit: 0, length_bits: 8, byte_order: "little", scale: 1, offset: -40, min: -40, max: 210, message_length: 8 };
const SPN_84 = { start_bit: 8, length_bits: 16, byte_order: "little", scale: 0.00390625, offset: 0, min: 0, max: 250.996, message_length: 8 };
const LAMP_RED = { start_bit: 4, length_bits: 2, byte_order: "little", scale: 1, offset: 0, min: 0, max: 3, message_length: 8 };

const EEC1 = [0xff, 0xa5, 0xa7, 0xe0, 0x2e, 0xff, 0xff, 0xff];

suite("core/signal.js — извлечение из реальных кадров");

test("SPN 190: обороты 1500 об/мин", () => {
  const got = extract(EEC1, SPN_190);
  eq(got.raw, 12000, "сырое значение");
  eq(got.value, 1500, "обороты");
  eq(got.state, STATE.OK, "состояние");
  eq(got.valid, true, "валидность");
});

test("SPN 512 и 513: момент 40 и 42 % при смещении -125", () => {
  eq(extract(EEC1, SPN_512).value, 40, "SPN 512");
  eq(extract(EEC1, SPN_513).value, 42, "SPN 513");
});

test("SPN 110: температура ОЖ 85 °C", () => {
  eq(extract([0x7d, 0x46, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff], SPN_110).value, 85, "температура");
});

test("SPN 84: скорость 60 км/ч при масштабе 1/256", () => {
  const got = extract([0xff, 0x00, 0x3c, 0xff, 0xff, 0x5a, 0xff, 0xff], SPN_84);
  eq(got.raw, 15360, "сырое значение");
  eq(got.value, 60, "скорость");
});

suite("core/signal.js — невыровненные сигналы");

test("4 бита со сдвигом на полбайта", () => {
  eq(extract([0xa5], { start_bit: 4, length_bits: 4 }).value, 0xa, "старшая половина байта");
  eq(extract([0xa5], { start_bit: 0, length_bits: 4 }).value, 0x5, "младшая половина байта");
});

test("4 бита со сдвигом на три бита, через границу байта", () => {
  // байты 0b1111_1000, 0b0000_0011: биты 11..14 дают 0b0110 = 6
  eq(extract([0xf8, 0x33], { start_bit: 11, length_bits: 4 }).value, 6, "значение");
});

test("16 бит со сдвигом на полбайта: 0xABCD в трёх байтах", () => {
  const spec = { start_bit: 12, length_bits: 16 };
  eq(extract([0x00, 0xd0, 0xbc, 0x0a], spec).value, 0xabcd, "значение");
});

test("сигнал в 1 бит", () => {
  eq(extract([0b0100_0000], { start_bit: 6, length_bits: 1 }).value, 1, "бит 6");
  eq(extract([0b0100_0000], { start_bit: 5, length_bits: 1 }).value, 0, "бит 5");
});

test("сигнал на 32 бита через весь кадр", () => {
  const spec = { start_bit: 8, length_bits: 32 };
  eq(extract([0x00, 0x78, 0x56, 0x34, 0x12, 0x00], spec).value, 0x12345678, "значение");
});

suite("core/signal.js — порядок байт");

test("big endian: старший бит в start_bit", () => {
  eq(extract([0xab, 0xcd], { start_bit: 7, length_bits: 16, byte_order: "big" }).value, 0xabcd, "значение");
});

test("little и big на одних байтах дают разное", () => {
  const bytes = [0x12, 0x34];
  eq(extract(bytes, { start_bit: 0, length_bits: 16 }).value, 0x3412, "little");
  eq(extract(bytes, { start_bit: 7, length_bits: 16, byte_order: "big" }).value, 0x1234, "big");
});

test("big endian, невыровненный: 12 бит", () => {
  // байты 0b1010_1011, 0b1100_1101: старший бит сигнала — бит 3 первого байта
  eq(extract([0xab, 0xcd], { start_bit: 3, length_bits: 12, byte_order: "big" }).value, 0xbcd, "значение");
});

suite("core/signal.js — специальные значения");

test("байт FF — данные недоступны, а не 255", () => {
  const got = extract([0xff], { start_bit: 0, length_bits: 8, scale: 1, offset: -40 });
  eq(got.state, STATE.NOT_AVAILABLE, "состояние");
  eq(got.value, null, "значение");
  eq(got.raw, 255, "сырое значение остаётся видно");
});

test("байт FE — ошибка датчика", () => {
  eq(extract([0xfe], { start_bit: 0, length_bits: 8 }).state, STATE.ERROR, "состояние");
});

test("FF FF на 16 битах — данные недоступны", () => {
  const got = extract([0xff, 0xff], { start_bit: 0, length_bits: 16 });
  eq(got.state, STATE.NOT_AVAILABLE, "состояние");
  eq(got.value, null, "значение");
});

test("FEFF на 16 битах — ошибка", () => {
  eq(extract([0xff, 0xfe], { start_bit: 0, length_bits: 16 }).state, STATE.ERROR, "состояние");
});

test("FFFE — это ещё диапазон «нет данных», а не ошибка", () => {
  eq(extract([0xfe, 0xff], { start_bit: 0, length_bits: 16 }).state, STATE.NOT_AVAILABLE, "состояние");
});

test("двухбитный переключатель: 11 — нет данных, 10 — ошибка, 01 — значение", () => {
  eq(extract([0b0011_0000], LAMP_RED).state, STATE.NOT_AVAILABLE, "11");
  eq(extract([0b0010_0000], LAMP_RED).state, STATE.ERROR, "10");
  const on = extract([0b0001_0000], LAMP_RED);
  eq(on.state, STATE.OK, "01");
  eq(on.value, 1, "значение лампы");
});

test("кадр из одних FF: все сигналы недоступны", () => {
  const all = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
  for (const spec of [SPN_190, SPN_512, SPN_513, SPN_110, SPN_84]) {
    eq(extract(all, spec).state, STATE.NOT_AVAILABLE, "состояние сигнала");
    eq(extract(all, spec).value, null, "значение сигнала");
  }
});

test("значение вне min/max помечается как невалидное, но считается", () => {
  const spec = { start_bit: 0, length_bits: 8, scale: 1, offset: 0, min: 0, max: 100 };
  const got = extract([200], spec);
  eq(got.value, 200, "значение");
  eq(got.valid, false, "валидность");
  eq(got.state, STATE.OK, "состояние");
});

suite("core/signal.js — обратный ход");

test("pack собирает кадр, остальные байты FF", () => {
  const { raw, bytes } = pack(1500, SPN_190);
  eq(raw, 12000, "сырое значение");
  eq(bytes.length, 8, "длина кадра");
  eqBytes(bytes, [0xff, 0xff, 0xff, 0xe0, 0x2e, 0xff, 0xff, 0xff]);
});

test("pack пишет в готовый кадр, не трогая соседние сигналы", () => {
  const frame = new Uint8Array(8).fill(0xff);
  pack(42, SPN_513, frame);
  pack(1500, SPN_190, frame);
  eqBytes(frame, [0xff, 0xff, 0xa7, 0xe0, 0x2e, 0xff, 0xff, 0xff]);
});

test("pack(null) — данные недоступны", () => {
  const { bytes } = pack(null, SPN_513);
  eq(bytes[2], 0xff, "байт сигнала");
});

test("pack со смещением: -40 °C даёт нулевой байт", () => {
  eq(pack(-40, SPN_110).bytes[0], 0, "байт");
});

test("pack за пределами разрядности — понятная ошибка", () => {
  throwsWith(() => pack(9000, SPN_190), "не укладывается");
  throwsWith(() => pack(-1, SPN_190), "не укладывается");
});

test("pack не числом — ошибка", () => throwsWith(() => pack("1500", SPN_190), "должно быть числом"));

suite("core/signal.js — прямой и обратный ход сходятся");

// Псевдослучайные значения с фиксированным зерном: провалившийся тест воспроизводится.
function makeRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const ROUND_TRIP = [
  ["SPN 190, масштаб 0.125", SPN_190],
  ["SPN 513, смещение -125", SPN_513],
  ["SPN 110, смещение -40", SPN_110],
  ["SPN 84, масштаб 1/256", SPN_84],
  ["4 бита со сдвигом", { start_bit: 4, length_bits: 4, scale: 1, offset: 0, min: 0, max: 15, message_length: 2 }],
  ["16 бит невыровненные", { start_bit: 12, length_bits: 16, scale: 0.5, offset: -100, message_length: 4 }],
  ["big endian, 12 бит", { start_bit: 3, length_bits: 12, byte_order: "big", scale: 0.25, offset: 0, message_length: 4 }],
];

for (const [name, spec] of ROUND_TRIP) {
  test("десять значений туда и обратно: " + name, () => {
    const random = makeRandom(20260822);
    const scale = spec.scale === undefined ? 1 : spec.scale;
    // Верх диапазона задаёт стандарт, а не разрядность: за потолком лежат
    // зарезервированные значения, «ошибка» и «нет данных».
    const limits = range(spec);
    for (let i = 0; i < 10; i++) {
      const value = Number(
        (limits.min + random() * (limits.max - limits.min)).toPrecision(12)
      );
      const packed = pack(value, spec);
      const got = extract(packed.bytes, spec);
      eq(got.state, STATE.OK, "состояние для " + value + " (потолок " + limits.max + ")");
      eq(got.valid, true, "валидность для " + value);
      close(got.value, value, Math.abs(scale) / 2, "значение " + value);
    }
  });
}

suite("core/signal.js — рабочий диапазон");

test("потолок байта — FA, а не FF", () => {
  const limits = range({ start_bit: 0, length_bits: 8, scale: 1, offset: 0 });
  eq(limits.rawMax, 0xfa, "сырой потолок");
  eq(limits.max, 250, "значение потолка");
});

test("потолок 16 бит — FAFF", () => {
  eq(range({ start_bit: 0, length_bits: 16, scale: 1, offset: 0 }).rawMax, 0xfaff, "сырой потолок");
});

test("потолок SPN 190 совпадает с max из справочника", () => {
  eq(range(SPN_190).max, 8031.875, "обороты");
});

test("двухбитный переключатель: рабочие значения 0 и 1", () => {
  eq(range(LAMP_RED).rawMax, 1, "сырой потолок");
});

test("однобитный флаг: рабочие значения 0 и 1", () => {
  eq(range({ start_bit: 0, length_bits: 1 }).rawMax, 1, "сырой потолок");
});

test("справочник может сузить диапазон, но не расширить", () => {
  const narrow = range({ start_bit: 0, length_bits: 8, scale: 1, offset: 0, min: 10, max: 100 });
  eq(narrow.min, 10, "низ");
  eq(narrow.max, 100, "верх");
  const wide = range({ start_bit: 0, length_bits: 8, scale: 1, offset: 0, min: -50, max: 300 });
  eq(wide.min, 0, "низ не опускается ниже физического");
  eq(wide.max, 250, "верх не поднимается выше потолка");
});

test("однобитный сигнал не путается со «специальными» значениями", () => {
  eq(extract([0b0100_0000], { start_bit: 6, length_bits: 1 }).state, STATE.OK, "состояние бита 1");
  eq(extract([0b0000_0000], { start_bit: 6, length_bits: 1 }).state, STATE.OK, "состояние бита 0");
});

suite("core/signal.js — кривое описание сигнала");

test("нет описания", () => throwsWith(() => extract([0], null), "нет описания"));
test("длина ноль", () => throwsWith(() => extract([0], { start_bit: 0, length_bits: 0 }), "length_bits"));
test("длина больше 64", () => throwsWith(() => extract([0], { start_bit: 0, length_bits: 65 }), "length_bits"));
test("отрицательный start_bit", () => throwsWith(() => extract([0], { start_bit: -1, length_bits: 8 }), "start_bit"));
test("нулевой масштаб", () =>
  throwsWith(() => extract([0], { start_bit: 0, length_bits: 8, scale: 0 }), "scale"));
test("сигнал за границей кадра", () =>
  throwsWith(() => extract([0xff, 0xff], SPN_190), "не помещается"));
test("ошибка — это SignalError", () => {
  let caught = null;
  try {
    extract([0], { start_bit: 0, length_bits: 0 });
  } catch (error) {
    caught = error;
  }
  eq(caught instanceof SignalError, true, "тип ошибки");
});
