// Загрузка и проверка справочника сообщений.
// Файл ничего не знает о конкретном протоколе: он видит сообщения с номерами и сигналами.
// Какой это протокол и где лежит файл — говорит вызывающая сторона.
//
// Замечания делятся на два уровня:
//   errors   — данные использовать нельзя: сигналы пересекаются, вылезают за длину,
//              нет обязательных полей. В режиме разработки такой справочник роняет приложение.
//   warnings — данные рабочие, но что-то не сходится: например, max округлён вверх
//              на полшага масштаба. Приложение работает, замечание видно в консоли.

import { footprint, range, isExact } from "./signal.js";

export class CatalogError extends Error {
  constructor(message, problems) {
    super(message);
    this.name = "CatalogError";
    this.problems = problems || [];
  }
}

const BYTE_ORDERS = ["little", "big"];
const TYPES = ["number", "enum"];

/**
 * Собирает справочник из разобранного JSON.
 * @param {object} raw содержимое файла
 * @param {{strict?: boolean}} [options] strict — падать на ошибках в данных (режим разработки)
 */
export function makeCatalog(raw, options = {}) {
  const strict = options.strict !== false;
  const out = { errors: [], warnings: [] };

  if (!raw || typeof raw !== "object") {
    throw new CatalogError("Справочник пуст или это не объект");
  }

  const messages = [];
  const serviceMessages = [];
  const byPgn = new Map();

  for (const message of asArray(raw.messages, "messages", out)) {
    // Сообщение с ошибкой в справочник не попадает: в строгом режиме мы всё равно упадём,
    // а на телефоне лучше показать остальные сообщения, чем сломать приложение целиком.
    if (checkMessage(message, out) === 0) {
      messages.push(message);
      byPgn.set(message.pgn, message);
    }
  }

  for (const message of asArray(raw.service_messages, "service_messages", out)) {
    if (checkServiceMessage(message, out) === 0) {
      const marked = { ...message, kind: "service" };
      serviceMessages.push(marked);
      byPgn.set(marked.pgn, marked);
    }
  }

  checkDuplicates(raw, out);

  if (out.errors.length && strict) {
    throw new CatalogError(
      "Справочник не прошёл проверку, ошибок: " + out.errors.length + "\n" + out.errors.join("\n"),
      out.errors
    );
  }

  return {
    messages,
    serviceMessages,
    byPgn,
    problems: out.errors,
    warnings: out.warnings,
    formatVersion: raw.format_version,
    protocol: raw.protocol,
    /** Сообщение по номеру PGN или null. */
    find(pgn) {
      return byPgn.get(pgn) || null;
    },
    /** Все сигналы всех сообщений — для поиска по справочнику. */
    signals() {
      const list = [];
      for (const message of messages) {
        for (const signal of message.signals) list.push({ message, signal });
      }
      return list;
    },
  };
}

/** Загружает справочник по адресу и сразу проверяет его. */
export async function loadCatalog(url, options = {}) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new CatalogError("Не удалось загрузить справочник " + url + ": " + response.status);
  }
  const raw = await response.json();
  const catalog = makeCatalog(raw, options);
  if (catalog.warnings.length) {
    console.warn("Справочник " + url + ", замечания:\n" + catalog.warnings.join("\n"));
  }
  return catalog;
}

/**
 * Строгая проверка — только при разработке. На телефоне у пользователя падать
 * из-за одной кривой строчки в справочнике нельзя.
 */
export function isDevHost(hostname) {
  const host = hostname === undefined ? location.hostname : hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "" || host.endsWith(".local");
}

// ==== Проверки ====

function checkMessage(message, out) {
  const before = out.errors.length;
  const where = "PGN " + (message && message.pgn !== undefined ? message.pgn : "без номера");

  if (!message || typeof message !== "object") {
    out.errors.push("Сообщение не объект: " + JSON.stringify(message));
    return out.errors.length - before;
  }
  if (!Number.isInteger(message.pgn) || message.pgn < 0) {
    out.errors.push(where + ": номер PGN должен быть целым числом");
  }
  if (typeof message.name !== "string" || !message.name.trim()) {
    out.errors.push(where + ": нет названия");
  }
  if (!Number.isInteger(message.length) || message.length < 1) {
    out.errors.push(where + ": длина сообщения должна быть целым числом от 1");
  }
  if (message.pgn_hex !== undefined && !sameHex(message.pgn_hex, message.pgn)) {
    out.errors.push(where + ": pgn_hex «" + message.pgn_hex + "» не соответствует номеру " + message.pgn);
  }
  if (message.rate_ms !== undefined && message.rate_ms !== null && !(message.rate_ms > 0)) {
    out.errors.push(where + ": rate_ms должен быть положительным числом или null");
  }
  if (!Array.isArray(message.signals) || message.signals.length === 0) {
    out.errors.push(where + ": нет ни одного сигнала");
    return out.errors.length - before;
  }

  const taken = new Map(); // бит → SPN, который его уже занял
  const seenSpn = new Set();

  for (const signal of message.signals) {
    checkSignal(signal, message, taken, seenSpn, out);
  }

  return out.errors.length - before;
}

function checkSignal(signal, message, taken, seenSpn, out) {
  const where =
    "PGN " + message.pgn + ", SPN " + (signal && signal.spn !== undefined ? signal.spn : "без номера");

  if (!signal || typeof signal !== "object") {
    out.errors.push("PGN " + message.pgn + ": сигнал не объект");
    return;
  }
  if (!Number.isInteger(signal.spn)) {
    out.errors.push(where + ": номер SPN должен быть целым числом");
  } else if (seenSpn.has(signal.spn)) {
    out.errors.push(where + ": такой SPN в этом сообщении уже есть");
  } else {
    seenSpn.add(signal.spn);
  }

  if (typeof signal.name !== "string" || !signal.name.trim()) {
    out.errors.push(where + ": нет названия");
  }
  if (signal.byte_order !== undefined && !BYTE_ORDERS.includes(signal.byte_order)) {
    out.errors.push(where + ": byte_order может быть little или big, получено «" + signal.byte_order + "»");
  }
  if (signal.type !== undefined && !TYPES.includes(signal.type)) {
    out.errors.push(where + ": type может быть number или enum, получено «" + signal.type + "»");
  }

  let place;
  try {
    place = footprint(signal);
  } catch (error) {
    out.errors.push(where + ": " + error.message);
    return;
  }

  // 1. Сигнал не должен вылезать за длину сообщения.
  if (place.bytesNeeded > message.length) {
    out.errors.push(
      where + ": сигнал занимает " + place.bytesNeeded + " байт, а в сообщении " + message.length
    );
  }

  // 2. Сигналы не должны пересекаться: пересечение почти всегда означает опечатку
  // в start_bit, а искать её потом по неверному значению на экране очень тяжело.
  for (const bit of place.bits) {
    const owner = taken.get(bit);
    if (owner !== undefined) {
      out.errors.push(where + ": бит " + bit + " уже занят сигналом SPN " + owner);
      break;
    }
  }
  for (const bit of place.bits) {
    if (!taken.has(bit)) taken.set(bit, signal.spn);
  }

  // 3. min и max должны быть согласованы со scale, offset и разрядностью.
  // У перечисления служебные коды — такая же часть словаря, как остальные
  // (для лампы 3 это «недоступно»), поэтому потолок считаем по разрядности.
  const scale = signal.scale === undefined ? 1 : signal.scale;
  const offset = signal.offset === undefined ? 0 : signal.offset;
  let limits;
  try {
    limits =
      signal.type === "enum"
        ? { min: offset, max: (Math.pow(2, signal.length_bits) - 1) * scale + offset }
        : range({ ...signal, min: undefined, max: undefined });
  } catch (error) {
    out.errors.push(where + ": " + error.message);
    return;
  }

  const epsilon = Math.abs(scale) / 2;
  if (typeof signal.min === "number" && signal.min < limits.min - epsilon) {
    out.warnings.push(
      where + ": min " + signal.min + " ниже физического минимума " + limits.min +
        " при scale " + scale + " и offset " + offset
    );
  }
  if (typeof signal.max === "number" && signal.max > limits.max + epsilon) {
    out.warnings.push(
      where + ": max " + signal.max + " выше физического потолка " + limits.max +
        " при " + signal.length_bits + " битах, scale " + scale + " и offset " + offset
    );
  }
  if (typeof signal.min === "number" && typeof signal.max === "number" && signal.min > signal.max) {
    out.errors.push(where + ": min больше max");
  }

  // 4. У перечисления должны быть подписи, иначе двухбитный переключатель бессмыслен.
  if (signal.type === "enum") {
    if (!signal.values || typeof signal.values !== "object" || Object.keys(signal.values).length === 0) {
      out.errors.push(where + ": тип enum, но нет ни одной подписи в values");
    } else {
      const top = Math.pow(2, signal.length_bits) - 1;
      for (const key of Object.keys(signal.values)) {
        const code = Number(key);
        if (!Number.isInteger(code) || code < 0 || code > top) {
          out.errors.push(where + ": код «" + key + "» не помещается в " + signal.length_bits + " бит");
        }
      }
    }
  }

  // 5. Длинные сигналы теряют точность в обычном числе.
  if (!isExact(signal)) {
    out.warnings.push(
      where + ": " + signal.length_bits + " бит — значение уже не точное, нужен отдельный разбор"
    );
  }

  // 6. doc_pos справочный, но если он есть — пусть сходится со start_bit.
  // Расхождение означает, что при подготовке данных ошиблись в одном из двух.
  if (typeof signal.doc_pos === "string") {
    const expected = docPosToStartBit(signal.doc_pos);
    if (expected !== null && expected !== signal.start_bit) {
      out.errors.push(
        where + ": doc_pos " + signal.doc_pos + " это start_bit " + expected +
          ", а в справочнике " + signal.start_bit
      );
    }
  }
}

function checkServiceMessage(message, out) {
  const before = out.errors.length;
  const where = "Служебный PGN " + (message && message.pgn !== undefined ? message.pgn : "без номера");

  if (!message || typeof message !== "object") {
    out.errors.push("Служебное сообщение не объект");
    return out.errors.length - before;
  }
  if (!Number.isInteger(message.pgn) || message.pgn < 0) {
    out.errors.push(where + ": номер PGN должен быть целым числом");
  }
  if (typeof message.name !== "string" || !message.name.trim()) {
    out.errors.push(where + ": нет названия");
  }
  if (message.pgn_hex !== undefined && !sameHex(message.pgn_hex, message.pgn)) {
    out.errors.push(where + ": pgn_hex «" + message.pgn_hex + "» не соответствует номеру " + message.pgn);
  }
  return out.errors.length - before;
}

function checkDuplicates(raw, out) {
  const seen = new Set();
  const all = [
    ...asArray(raw.messages, "messages", { errors: [], warnings: [] }),
    ...asArray(raw.service_messages, "service_messages", { errors: [], warnings: [] }),
  ];
  for (const message of all) {
    if (!message || !Number.isInteger(message.pgn)) continue;
    if (seen.has(message.pgn)) out.errors.push("PGN " + message.pgn + " описан больше одного раза");
    seen.add(message.pgn);
  }
}

// ==== Мелочи ====

function asArray(value, name, out) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    out.errors.push("Раздел " + name + " должен быть массивом");
    return [];
  }
  return value;
}

function sameHex(text, number) {
  const cleaned = String(text).trim().replace(/^0X/i, "");
  return parseInt(cleaned, 16) === number;
}

// «4.1» — четвёртый байт, первый бит, нумерация с единицы. В коде живёт только start_bit.
function docPosToStartBit(docPos) {
  const match = /^(\d+)\.(\d+)$/.exec(docPos.trim());
  if (!match) return null;
  const byte = Number(match[1]);
  const bit = Number(match[2]);
  if (byte < 1 || bit < 1 || bit > 8) return null;
  return (byte - 1) * 8 + (bit - 1);
}
