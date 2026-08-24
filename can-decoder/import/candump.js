// Формат SocketCAN — то, что выдаёт утилита candump. Встречается в двух видах:
//   can0  18F00400   [8]  FF A5 A7 E0 2E FF FF FF
//   (1755859200.123456) can0 18F00400#FFA5A7E02EFFFFFF
// Метка времени и имя интерфейса могут отсутствовать.

const LINE =
  /^\s*(?:\(\s*([\d.]+)\s*\)\s+)?([A-Za-z][A-Za-z0-9]*\d)\s+([0-9A-Fa-f]{3,8})\s*(?:#\s*([0-9A-Fa-f]*)|\[(\d+)\]\s*((?:[0-9A-Fa-f]{2}[\s,]*)*))\s*$/;

export const name = "candump";

/** Похожа ли строка на вывод candump. */
export function detect(line) {
  return LINE.test(line);
}

/**
 * @returns {{time: number|null, channel: string, idHex: string, dataHex: string}|null}
 */
export function parseLine(line) {
  const match = LINE.exec(line);
  if (!match) return null;

  const [, time, channel, idHex, packed, , spaced] = match;
  const dataHex = (packed !== undefined ? packed : spaced || "").replace(/[^0-9A-Fa-f]/g, "");

  return {
    time: time === undefined ? null : Number(time),
    channel,
    idHex,
    dataHex,
  };
}
