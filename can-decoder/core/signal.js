// Единственное место, где происходит битовая арифметика.
// Всё остальное приложение работает с готовыми числами и не знает, как они уложены в байты.
//
// Нумерация битов: в описании сигнала лежит `start_bit` — 0-based, сквозной от начала сообщения.
// Позиция «байт.бит» из документации (1-based, например 4.1) в код не попадает вообще:
// пересчёт делается один раз при подготовке справочника. Здесь только 0-based.

export class SignalError extends Error {
  constructor(message) {
    super(message);
    this.name = "SignalError";
  }
}

export const STATE = {
  OK: "ok",
  NOT_AVAILABLE: "not_available",
  ERROR: "error",
};

const MAX_LENGTH = 64;
// Выше 2^53 обычное число в JS уже неточно. Сигналы такой длины в J1939 — только
// служебные (NAME в Address Claimed), их мы не разбираем, но знать об этом надо.
const EXACT_BITS = 53;

/**
 * Извлекает сигнал из байтов кадра.
 * @param {Uint8Array|number[]} bytes
 * @param {object} spec описание сигнала из справочника
 * @returns {{raw: number, value: number|null, valid: boolean, state: string}}
 */
export function extract(bytes, spec) {
  const { startBit, length, order, scale, offset } = normalize(spec);
  const data = toBytes(bytes);

  const needed = bytesNeeded(startBit, length, order);
  if (needed > data.length) {
    throw new SignalError(
      "Сигнал не помещается в кадр: нужно " + needed + " байт, а в кадре " + data.length
    );
  }

  const raw = readBits(data, startBit, length, order);
  const state = stateOf(raw, length);
  const rawNumber = Number(raw);

  if (state !== STATE.OK) {
    // Специальные значения не превращаем в число: 255 — это «нет данных»,
    // а не температура 215 °C.
    return { raw: rawNumber, value: null, valid: false, state };
  }

  const value = trim(rawNumber * scale + offset);
  return { raw: rawNumber, value, valid: inRange(value, spec), state };
}

/**
 * Обратный ход: значение → сырое число и байты кадра.
 * @param {number|null} value значение в единицах параметра; null — «данные недоступны»
 * @param {object} spec описание сигнала
 * @param {Uint8Array} [into] куда писать; по умолчанию новый кадр, забитый FF
 * @returns {{raw: number, bytes: Uint8Array}}
 */
export function pack(value, spec, into) {
  const { startBit, length, order, scale, offset } = normalize(spec);
  const limit = allOnes(length);

  let raw;
  if (value === null || value === undefined) {
    raw = limit; // все единицы — «данные недоступны»
  } else {
    if (typeof value !== "number" || !isFinite(value)) {
      throw new SignalError("Значение должно быть числом, получено " + value);
    }
    const rounded = Math.round((value - offset) / scale);
    if (rounded < 0 || BigInt(rounded) > limit) {
      throw new SignalError(
        "Значение " + value + " не укладывается в " + length + " бит: допустимо от " +
          trim(offset) + " до " + trim(Number(limit) * scale + offset)
      );
    }
    raw = BigInt(rounded);
  }

  const needed = bytesNeeded(startBit, length, order);
  let bytes;
  if (into) {
    bytes = into;
    if (bytes.length < needed) {
      throw new SignalError(
        "Сигнал не помещается в кадр: нужно " + needed + " байт, а в кадре " + bytes.length
      );
    }
  } else {
    // Незаполненные байты — FF: по стандарту это «данные недоступны», а не ноль,
    // который приёмник примет за настоящее значение.
    bytes = new Uint8Array(Math.max(needed, spec.message_length || 0)).fill(0xff);
  }

  writeBits(bytes, startBit, length, order, raw);
  return { raw: Number(raw), bytes };
}

// ==== Разбор описания ====

function normalize(spec) {
  if (!spec || typeof spec !== "object") {
    throw new SignalError("Нет описания сигнала");
  }
  const startBit = spec.start_bit;
  const length = spec.length_bits;

  if (!Number.isInteger(startBit) || startBit < 0) {
    throw new SignalError("start_bit должен быть целым числом от нуля, получено " + startBit);
  }
  if (!Number.isInteger(length) || length < 1 || length > MAX_LENGTH) {
    throw new SignalError("length_bits должен быть от 1 до " + MAX_LENGTH + ", получено " + length);
  }

  const order = spec.byte_order === "big" ? "big" : "little";
  const scale = spec.scale === undefined || spec.scale === null ? 1 : spec.scale;
  const offset = spec.offset === undefined || spec.offset === null ? 0 : spec.offset;

  if (typeof scale !== "number" || scale === 0 || !isFinite(scale)) {
    throw new SignalError("scale должен быть ненулевым числом, получено " + spec.scale);
  }
  if (typeof offset !== "number" || !isFinite(offset)) {
    throw new SignalError("offset должен быть числом, получено " + spec.offset);
  }

  return { startBit, length, order, scale, offset };
}

function toBytes(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (Array.isArray(bytes)) return Uint8Array.from(bytes);
  throw new SignalError("Нужны байты кадра: Uint8Array или массив чисел");
}

// ==== Биты ====

// Little endian (J1939 по умолчанию): start_bit — младший бит сигнала,
// дальше биты идут в сторону старших позиций и переходят в следующий байт.
// Big endian: start_bit — старший бит, дальше вниз по битам байта, потом бит 7 следующего.
function positions(startBit, length, order) {
  const list = new Array(length);
  if (order === "little") {
    for (let i = 0; i < length; i++) list[i] = startBit + i;
    return list; // от младшего бита к старшему
  }
  let byte = startBit >> 3;
  let bit = startBit & 7;
  for (let k = 0; k < length; k++) {
    list[length - 1 - k] = byte * 8 + bit; // k = 0 — старший бит сигнала
    if (bit === 0) {
      bit = 7;
      byte += 1;
    } else {
      bit -= 1;
    }
  }
  return list;
}

function bytesNeeded(startBit, length, order) {
  const list = positions(startBit, length, order);
  let last = 0;
  for (const p of list) if (p > last) last = p;
  return (last >> 3) + 1;
}

function readBits(bytes, startBit, length, order) {
  const list = positions(startBit, length, order);
  let raw = 0n;
  for (let i = length - 1; i >= 0; i--) {
    const p = list[i];
    const bit = (bytes[p >> 3] >> (p & 7)) & 1;
    raw = (raw << 1n) | BigInt(bit);
  }
  return raw;
}

function writeBits(bytes, startBit, length, order, raw) {
  const list = positions(startBit, length, order);
  for (let i = 0; i < length; i++) {
    const p = list[i];
    const bit = Number((raw >> BigInt(i)) & 1n);
    const mask = 1 << (p & 7);
    if (bit) bytes[p >> 3] |= mask;
    else bytes[p >> 3] &= ~mask & 0xff;
  }
}

function allOnes(length) {
  return (1n << BigInt(length)) - 1n;
}

// ==== Специальные значения J1939 ====

// До байта включительно: все единицы — нет данных, на единицу меньше — ошибка
// (для двухбитного переключателя это 11 и 10, для байта — FF и FE).
// Длиннее байта — смотрим старший байт: FF — нет данных, FE — ошибка,
// так стандарт задаёт диапазоны FF00–FFFF и FE00–FEFF.
function stateOf(raw, length) {
  const ones = allOnes(length);
  // Однобитный сигнал — это флаг: и 0, и 1 означают состояние, специальных значений нет.
  if (length === 1) return STATE.OK;
  if (length <= 8) {
    if (raw === ones) return STATE.NOT_AVAILABLE;
    if (raw === ones - 1n) return STATE.ERROR;
    return STATE.OK;
  }
  const top = raw >> BigInt(length - 8);
  if (top === 0xffn) return STATE.NOT_AVAILABLE;
  if (top === 0xfen) return STATE.ERROR;
  return STATE.OK;
}

function inRange(value, spec) {
  if (typeof spec.min === "number" && value < spec.min) return false;
  if (typeof spec.max === "number" && value > spec.max) return false;
  return true;
}

// Умножение на дробный масштаб оставляет хвосты вида 84.60000000000001.
// Двенадцати значащих цифр хватает любому параметру J1939, а хвост срезается.
function trim(value) {
  if (!isFinite(value)) return value;
  return Number(value.toPrecision(12));
}

/**
 * Диапазон значений, которые сигнал реально может нести.
 * Верх ограничен не разрядностью, а стандартом: для байта FB–FD зарезервированы,
 * FE — ошибка, FF — нет данных, поэтому потолок 8-битного сигнала это FA, а не FF.
 * Для сигналов длиннее байта то же самое по старшему байту: потолок FAFF, FAFFFFFF и так далее.
 * @returns {{min: number, max: number, rawMax: number}}
 */
export function range(spec) {
  const { length, scale, offset } = normalize(spec);
  const ones = allOnes(length);

  let rawMax;
  if (length === 1) rawMax = ones;
  else if (length === 2) rawMax = ones - 2n; // 10 — ошибка, 11 — нет данных
  else if (length <= 8) rawMax = ones - 5n; // FB–FD зарезервированы
  else rawMax = (0xfan << BigInt(length - 8)) | allOnes(length - 8);

  const ends = [offset, Number(rawMax) * scale + offset];
  let min = trim(Math.min(...ends));
  let max = trim(Math.max(...ends));

  // Справочник может сузить диапазон, но не расширить: за потолком лежат служебные значения.
  if (typeof spec.min === "number" && spec.min > min) min = spec.min;
  if (typeof spec.max === "number" && spec.max < max) max = spec.max;

  return { min, max, rawMax: Number(rawMax) };
}

/** Помещается ли сигнал в число без потери точности — пригодится валидатору справочника. */
export function isExact(spec) {
  return spec.length_bits <= EXACT_BITS;
}
