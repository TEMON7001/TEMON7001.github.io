// Разбор 29-битного идентификатора по SAE J1939.
// Это единственное место, где приложение знает, как устроен идентификатор J1939.
// Ядро (core/) про этот файл не знает и знать не должно.
//
// Раскладка битов:
//   28..26  приоритет
//   25..24  страница данных (старший бит — EDP: единица означает уже не J1939-71)
//   23..16  PDU Format (PF)
//   15..8   PDU Specific (PS): адрес получателя при PF < 240, часть PGN при PF >= 240
//   7..0    адрес отправителя (SA)

export class IdError extends Error {
  constructor(message) {
    super(message);
    this.name = "IdError";
  }
}

// Граница между адресуемым и широковещательным сообщением.
const PDU1_LIMIT = 240;
const ID_29_MAX = 0x1fffffff;
// Адрес 255 — «всем»: в J1939 это глобальный адрес.
export const GLOBAL_ADDRESS = 0xff;

/**
 * Разбирает 29-битный идентификатор.
 * @param {number|{id: number, ext: boolean}} input идентификатор или кадр из core/frame.js
 * @returns {{id, priority, dp, pf, ps, sa, da, pgn, pgnHex, idHex, pduFormat, broadcast}}
 */
export function parseId(input) {
  const id = typeof input === "object" && input !== null ? input.id : input;
  const ext = typeof input === "object" && input !== null ? input.ext : undefined;

  if (!Number.isInteger(id) || id < 0) {
    throw new IdError("Идентификатор должен быть целым неотрицательным числом");
  }
  if (id > ID_29_MAX) {
    throw new IdError("Идентификатор не помещается в 29 бит");
  }
  if (ext === false) {
    throw new IdError(
      "Это 11-битный идентификатор: в J1939 такие кадры не используются, разбирать нечего"
    );
  }

  const priority = (id >>> 26) & 0x07;
  const dp = (id >>> 24) & 0x03; // два бита: EDP и DP
  const pf = (id >>> 16) & 0xff;
  const ps = (id >>> 8) & 0xff;
  const sa = id & 0xff;

  // PF < 240 — адресуемое сообщение: PS это адрес получателя и в номер PGN не входит.
  // Классическая ошибка — включить его туда и не найти сообщение в справочнике.
  const addressed = pf < PDU1_LIMIT;
  const pgn = addressed ? (dp << 16) | (pf << 8) : (dp << 16) | (pf << 8) | ps;

  return {
    id,
    idHex: hex(id, 8),
    priority,
    dp,
    pf,
    ps,
    sa,
    da: addressed ? ps : null,
    pgn,
    pgnHex: pgnToHex(pgn),
    pduFormat: addressed ? "PDU1" : "PDU2",
    broadcast: !addressed || ps === GLOBAL_ADDRESS,
  };
}

/**
 * Собирает идентификатор обратно — для экрана «Обратный расчёт».
 * @param {{pgn: number, priority?: number, sa?: number, da?: number}} parts
 */
export function buildId({ pgn, priority = 6, sa = 0, da = GLOBAL_ADDRESS }) {
  if (!Number.isInteger(pgn) || pgn < 0 || pgn > 0x3ffff) {
    throw new IdError("PGN должен быть числом от 0 до 262143");
  }
  if (priority < 0 || priority > 7) {
    throw new IdError("Приоритет — это число от 0 до 7");
  }
  if (sa < 0 || sa > 255 || da < 0 || da > 255) {
    throw new IdError("Адрес — это число от 0 до 255");
  }

  const dp = (pgn >>> 16) & 0x03;
  const pf = (pgn >>> 8) & 0xff;
  // У адресуемого сообщения младший байт PGN нулевой, туда встаёт адрес получателя.
  const ps = pf < PDU1_LIMIT ? da : pgn & 0xff;

  return ((priority & 0x07) << 26) | (dp << 24) | (pf << 16) | (ps << 8) | sa;
}

/** Номер PGN, который запрашивают сообщением RQST (PGN 59904): три байта, младший первым. */
export function parseRequestedPgn(bytes) {
  if (!bytes || bytes.length < 3) {
    throw new IdError("В запросе должно быть три байта номера PGN");
  }
  return bytes[0] | (bytes[1] << 8) | (bytes[2] << 16);
}

/** PGN в том же виде, в каком он записан в справочнике: 0xF004. */
export function pgnToHex(pgn) {
  return "0x" + hex(pgn, 4);
}

function hex(value, width) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}
