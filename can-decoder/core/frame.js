// Нормализация пользовательского ввода в кадр CAN.
// Здесь нет ничего про J1939: на выходе только идентификатор, признак 29 бит и байты.
// Что делать с этим идентификатором, решает протокольный адаптер.

export class FrameError extends Error {
  constructor(message) {
    super(message);
    this.name = "FrameError";
  }
}

// Классический CAN: до 8 байт данных. CAN FD (до 64) в MVP не поддерживаем.
const MAX_BYTES = 8;
const ID_11_MAX = 0x7ff;
const ID_29_MAX = 0x1fffffff;

// Всё, чем человек может разделить байты: пробел, таб, перевод строки,
// запятая, точка с запятой, двоеточие, дефис, точка, подчёркивание, вертикальная черта.
const SEPARATORS = /[\s,;:\-.|_]+/;

/**
 * Разбирает строку в кадр.
 * @param {string} input
 * @returns {{id: number, ext: boolean, dlc: number, bytes: Uint8Array}}
 * @throws {FrameError} с текстом на русском — его показываем пользователю как есть
 */
export function parseFrame(input) {
  if (typeof input !== "string" || input.trim() === "") {
    throw new FrameError("Пустой ввод: вставьте кадр, например 18FEE000 FF FF 82 00");
  }

  const text = input.trim().toUpperCase();

  // Строку из лога сюда вставляют регулярно. Разбирать её здесь не будем — это работа
  // экрана «Лог», — но и молчаливое «недопустимый символ» пользователю ничего не объясняет.
  if (looksLikeLogLine(text)) {
    throw new FrameError(
      "Похоже на строку из лога: экран «Лог» разберёт её целиком. " +
        "Сюда вставьте только идентификатор и байты, например 18FEE000 FF FF 82 00"
    );
  }
  const hash = text.indexOf("#");

  let idHex;
  let dataHex;

  if (hash !== -1) {
    // Формат candump: слева от # идентификатор, справа данные.
    if (text.indexOf("#", hash + 1) !== -1) {
      throw new FrameError("В кадре больше одного знака #");
    }
    idHex = joinHex(text.slice(0, hash));
    dataHex = joinHex(text.slice(hash + 1));
  } else {
    const tokens = text.split(SEPARATORS).filter(Boolean).map(stripPrefix);
    if (tokens.length === 0) {
      throw new FrameError("Пустой ввод: вставьте кадр, например 18FEE000 FF FF 82 00");
    }
    if (tokens.length === 1) {
      // Слитная запись: разделителей нет, границу ищем по длине.
      // Идентификатор — 8 hex-цифр (29 бит) либо 3 (11 бит), значит чётная общая длина
      // означает 8-значный идентификатор, нечётная — 3-значный.
      // Длинную нечётную строку считаем 8-значным идентификатором с недобитым байтом:
      // так пользователь получит «не хватает половины байта», а не молчаливый разбор мусора.
      const one = tokens[0];
      checkHex(one);
      if (one.length < 3) {
        throw new FrameError(
          "Слишком короткий ввод: идентификатор — это минимум три hex-цифры"
        );
      }
      const idLength = one.length % 2 === 0 ? Math.min(one.length, 8) : one.length < 8 ? 3 : 8;
      idHex = one.slice(0, idLength);
      dataHex = one.slice(idLength);
    } else {
      idHex = stripPrefix(tokens[0]);
      dataHex = tokens.slice(1).join("");
    }
  }

  return build(idHex, dataHex);
}

function build(idHex, dataHex) {
  checkHex(idHex);
  checkHex(dataHex);

  if (idHex.length === 0) {
    throw new FrameError("Не указан идентификатор кадра");
  }
  if (idHex.length > 8) {
    throw new FrameError(
      "Идентификатор длиннее 8 hex-цифр: " + idHex.length + " — столько в CAN не бывает"
    );
  }

  const id = parseInt(idHex, 16);
  if (id > ID_29_MAX) {
    throw new FrameError("Идентификатор " + idHex + " не помещается в 29 бит");
  }

  // 29 бит либо по длине записи (ведущие нули пишут не всегда), либо по значению.
  const ext = idHex.length > 3 || id > ID_11_MAX;

  if (dataHex.length % 2 !== 0) {
    throw new FrameError(
      "Не хватает половины байта: в данных " + dataHex.length + " hex-цифр, нужно чётное число"
    );
  }

  const dlc = dataHex.length / 2;
  if (dlc > MAX_BYTES) {
    throw new FrameError(
      "В кадре " + dlc + " байт, а в классическом CAN их не больше " + MAX_BYTES
    );
  }

  const bytes = new Uint8Array(dlc);
  for (let i = 0; i < dlc; i++) {
    bytes[i] = parseInt(dataHex.slice(i * 2, i * 2 + 2), 16);
  }

  return { id, ext, dlc, bytes };
}

// Склеивает часть строки в сплошной hex, выбрасывая разделители и префиксы 0x.
function joinHex(part) {
  return part
    .split(SEPARATORS)
    .filter(Boolean)
    .map(stripPrefix)
    .join("");
}

// Признаки строки candump и подобных: имя интерфейса (can0, vcan1), длина в скобках [8],
// метка времени в круглых скобках.
function looksLikeLogLine(text) {
  // Имя интерфейса — буквы, потом цифры, и хотя бы одна буква вне A–F: can0, vcan1, slcan0.
  // Идентификатор из одних hex-букв (FFF) под это не подходит, а опечатка в середине
  // идентификатора (18ZE0000) получит честное «недопустимый символ».
  const first = stripPrefix(text.split(SEPARATORS).filter(Boolean)[0] || "");
  return (
    (/^[A-Z]+\d*$/.test(first) && /[G-Z]/.test(first)) ||
    /\[\s*\d+\s*\]/.test(text) ||
    /\(\s*\d+[.,]\d+\s*\)/.test(text)
  );
}

function stripPrefix(token) {
  return token.startsWith("0X") ? token.slice(2) : token;
}

function checkHex(hex) {
  const bad = hex.match(/[^0-9A-F]/);
  if (bad) {
    throw new FrameError(
      "Недопустимый символ «" + bad[0] + "»: в кадре только цифры 0–9 и буквы A–F"
    );
  }
}

/** Байты в строку вида «FF FF 82 00» — для вывода и для тестов. */
export function bytesToHex(bytes, separator = " ") {
  return Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, "0")).join(separator);
}

/** Идентификатор в hex нужной ширины: 8 цифр для 29 бит, 3 для 11. */
export function idToHex(id, ext) {
  return id.toString(16).toUpperCase().padStart(ext ? 8 : 3, "0");
}
