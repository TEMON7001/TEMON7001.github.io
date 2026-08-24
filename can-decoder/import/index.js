// Общий вход для логов: текст на входе, поток кадров и сводка на выходе.
// Формат определяется по первым строкам, а не спрашивается у пользователя.

import * as candump from "./candump.js";
import * as generic from "./generic.js";

const PARSERS = [candump, generic];
// Сколько строк смотрим, чтобы понять формат. Больше не нужно: если первые
// полсотни разобрались одним парсером, остальные разберутся им же.
const SNIFF_LINES = 50;
// Сколько строк с ошибкой показываем пользователю: остальные только считаем.
const SAMPLE_ERRORS = 5;

/**
 * @param {string} text содержимое файла или вставленный текст
 * @returns {{format: string, lines: number, frames: Array, skipped: number, samples: Array, time: object|null}}
 */
export function parseLog(text) {
  const lines = String(text || "").split(/\r?\n/);
  const parser = sniff(lines);

  const frames = [];
  const samples = [];
  let skipped = 0;
  let first = null;
  let last = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const parsed = parser.parseLine(line);
    if (!parsed) {
      skipped += 1;
      if (samples.length < SAMPLE_ERRORS) samples.push({ line: line.trim().slice(0, 80), number: i + 1 });
      continue;
    }

    const frame = toFrame(parsed);
    if (!frame) {
      skipped += 1;
      if (samples.length < SAMPLE_ERRORS) samples.push({ line: line.trim().slice(0, 80), number: i + 1 });
      continue;
    }

    frame.number = i + 1;
    frames.push(frame);
    if (frame.time !== null) {
      if (first === null) first = frame.time;
      last = frame.time;
    }
  }

  return {
    format: parser.name,
    lines: lines.length,
    frames,
    skipped,
    samples,
    time: first === null ? null : { first, last, span: last - first },
  };
}

/**
 * Сводка по сообщениям: сколько кадров, как часто, от кого.
 * Считаем по паре «номер сообщения + адрес отправителя»: один и тот же PGN
 * шлют разные блоки, и механику важно, кто именно.
 * @param {Array} frames из parseLog
 * @param {{parseId: Function}} protocol
 */
export function summarize(frames, protocol) {
  const groups = new Map();

  for (const frame of frames) {
    let id;
    try {
      id = protocol.parseId(frame);
    } catch {
      continue; // 11-битные кадры к J1939 отношения не имеют
    }

    const key = id.pgn + ":" + id.sa;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        pgn: id.pgn,
        sa: id.sa,
        pgnHex: id.pgnHex,
        count: 0,
        firstTime: frame.time,
        lastTime: frame.time,
        last: frame,
        id,
      };
      groups.set(key, group);
    }

    group.count += 1;
    group.last = frame;
    group.id = id;
    if (frame.time !== null) {
      if (group.firstTime === null) group.firstTime = frame.time;
      group.lastTime = frame.time;
    }
  }

  const list = Array.from(groups.values());
  for (const group of list) {
    // Средний период между кадрами: по нему сразу видно, идёт ли сообщение
    // с паспортной частотой или пропадает.
    const span = group.firstTime !== null && group.lastTime !== null ? group.lastTime - group.firstTime : 0;
    group.periodMs = group.count > 1 && span > 0 ? (span * 1000) / (group.count - 1) : null;
  }

  list.sort((a, b) => b.count - a.count || a.pgn - b.pgn);
  return list;
}

function sniff(lines) {
  const sample = [];
  for (const line of lines) {
    if (line.trim()) sample.push(line);
    if (sample.length >= SNIFF_LINES) break;
  }
  if (!sample.length) return generic;

  for (const parser of PARSERS) {
    const hits = sample.filter((line) => parser.detect(line)).length;
    // Половины распознанных строк достаточно: в логах попадаются заголовки и мусор.
    if (hits >= Math.ceil(sample.length / 2)) return parser;
  }
  return generic;
}

// Собираем кадр без core/frame.js: там разбор рассчитан на одну строку от человека,
// с подсказками и исключениями, а здесь десять тысяч строк и молчаливый пропуск мусора.
function toFrame(parsed) {
  const { idHex, dataHex } = parsed;
  if (!idHex || idHex.length > 8) return null;

  const id = parseInt(idHex, 16);
  if (!Number.isFinite(id) || id > 0x1fffffff) return null;

  const dlc = dataHex.length / 2;
  if (dlc > 8) return null;

  const bytes = new Uint8Array(dlc);
  for (let i = 0; i < dlc; i++) bytes[i] = parseInt(dataHex.slice(i * 2, i * 2 + 2), 16);

  return {
    id,
    ext: idHex.length > 3 || id > 0x7ff,
    dlc,
    bytes,
    time: parsed.time,
    channel: parsed.channel || null,
  };
}
