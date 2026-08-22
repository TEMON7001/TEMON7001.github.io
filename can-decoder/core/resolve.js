// Соединяет кадр со справочником: на входе байты и описание протокола,
// на выходе список сигналов со значениями и раскладка байтов.
// Про конкретный протокол файл не знает: адаптер передают снаружи.

import { extract, footprint } from "./signal.js";

export const KIND = {
  MESSAGE: "message", // сообщение есть в справочнике, сигналы разобраны
  SERVICE: "service", // служебное: узнаём и подписываем, данные не разбираем
  UNKNOWN: "unknown", // номер не найден — показываем сырые байты и не выдумываем
};

/**
 * @param {{id: number, ext: boolean, dlc: number, bytes: Uint8Array}} frame из core/frame.js
 * @param {object} catalog из core/catalog.js
 * @param {{parseId: Function}} protocol адаптер протокола, например protocols/j1939
 */
export function resolve(frame, catalog, protocol) {
  const id = protocol.parseId(frame);
  const message = catalog.find(id.pgn);

  const result = {
    frame,
    id,
    message,
    kind: !message ? KIND.UNKNOWN : message.kind === "service" ? KIND.SERVICE : KIND.MESSAGE,
    handler: message && message.handler ? message.handler : null,
    signals: [],
    skipped: [],
    byteOwners: new Array(frame.dlc).fill(null).map(() => []),
    lengthMismatch: null,
  };

  if (result.kind !== KIND.MESSAGE) return result;

  // Длина не совпала — не повод не разбирать: короткий кадр разберём насколько хватает байт,
  // а расхождение покажем отдельно.
  if (typeof message.length === "number" && message.length !== frame.dlc) {
    result.lengthMismatch = { expected: message.length, got: frame.dlc };
  }

  for (const spec of message.signals) {
    const place = footprint(spec);
    if (place.bytesNeeded > frame.dlc) {
      result.skipped.push({
        spn: spec.spn,
        name: spec.name,
        spec,
        reason: "в кадре только " + frame.dlc + " байт, а сигнал начинается дальше",
      });
      continue;
    }

    const got = extract(frame.bytes, spec);
    result.signals.push({
      spn: spec.spn,
      name: spec.name,
      unit: spec.unit || "",
      spec,
      raw: got.raw,
      value: got.value,
      state: got.state,
      valid: got.valid,
      label: labelOf(spec, got.raw),
      bytes: place.bytes,
      bits: place.bits,
    });

    for (const index of place.bytes) {
      if (result.byteOwners[index]) result.byteOwners[index].push(spec.spn);
    }
  }

  return result;
}

// Подпись для перечисления. Без неё двухбитный переключатель бессмыслен,
// поэтому подписи обязательны к выводу — и берутся только из справочника.
function labelOf(spec, raw) {
  if (spec.type !== "enum" || !spec.values) return null;
  const label = spec.values[String(raw)];
  return label === undefined ? null : label;
}
