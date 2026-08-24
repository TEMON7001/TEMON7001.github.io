// Произвольный текст и csv: строка режется на поля, из них берутся идентификатор и байты.
// Формат заранее неизвестен, поэтому поля разбираются по смыслу, а не по номеру столбца.

export const name = "текст";

// Метка времени, номер строки, счётчик: в идентификатор такое не годится.
const LOOKS_LIKE_TIME = /^\d+[.,]\d+$/;
const HEX = /^[0-9A-Fa-f]+$/;

export function detect(line) {
  return parseLine(line) !== null;
}

/**
 * @returns {{time: number|null, channel: string|null, idHex: string, dataHex: string}|null}
 */
export function parseLine(line) {
  const raw = String(line).trim();
  if (!raw || raw.startsWith("#") || raw.startsWith("//")) return null;

  let time = null;
  let channel = null;
  const idParts = [];
  const dataParts = [];

  for (let field of raw.split(/[\s,;|]+/)) {
    if (!field) continue;

    if (LOOKS_LIKE_TIME.test(field)) {
      if (time === null) time = Number(field.replace(",", "."));
      continue;
    }

    // Запись вида 18F00400#FFA5A7: идентификатор и данные в одном поле.
    if (field.includes("#")) {
      const [left, right = ""] = field.split("#");
      const id = strip(left);
      if (HEX.test(id) && id.length >= 3 && id.length <= 8 && !idParts.length) idParts.push(id);
      const data = strip(right);
      if (HEX.test(data)) dataParts.push(data);
      continue;
    }

    // Длину кадра пишут по-разному — [8] или отдельным столбцом 8. В данные она не годится:
    // байт это всегда две цифры, поэтому поля нечётной длины отбрасываем.
    if (field.startsWith("[")) continue;

    const value = strip(field);
    if (!HEX.test(value)) {
      // can0, vcan1 и прочие имена интерфейсов пропускаем, заголовки csv тоже.
      if (channel === null && /^[A-Za-z][A-Za-z0-9]*\d$/.test(field)) channel = field;
      continue;
    }

    if (!idParts.length && value.length >= 3 && value.length <= 8) idParts.push(value);
    else if (value.length % 2 === 0) dataParts.push(value);
  }

  if (!idParts.length) {
    // Слитная запись без разделителей: 0CF00400FFA5A7E02EFFFFFF. Границу ищем по чётности,
    // как на экране «Кадр»: идентификатор это 8 hex-цифр или 3.
    const solid = dataParts.length === 1 ? dataParts[0] : "";
    if (solid.length >= 10) {
      const idLength = solid.length % 2 === 0 ? 8 : 3;
      return { time, channel, idHex: solid.slice(0, idLength), dataHex: solid.slice(idLength) };
    }
    return null;
  }

  const dataHex = dataParts.join("");
  // Нечётное число цифр в данных означает, что строка разобрана неверно:
  // молча терять полбайта нельзя.
  if (dataHex.length % 2 !== 0) return null;

  return { time, channel, idHex: idParts[0], dataHex };
}

function strip(field) {
  const value = field.replace(/^\[|\]$/g, "");
  return value.toUpperCase().startsWith("0X") ? value.slice(2) : value;
}
