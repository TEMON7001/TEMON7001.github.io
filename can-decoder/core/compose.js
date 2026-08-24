// Сборка кадра из значений параметров — обратный ход к resolve.
// Про J1939 файл не знает: получает описание сообщения из справочника и значения.

import { pack, range, STATE } from "./signal.js";

/**
 * @param {object} message запись сообщения из справочника
 * @param {Map<number, number|null>|object} values значения по номеру параметра; null — «данные недоступны»
 * @returns {{bytes: Uint8Array, filled: Array, problems: Array}}
 */
export function composeMessage(message, values) {
  const length = Number.isInteger(message.length) && message.length > 0 ? message.length : 8;
  // Незаполненные байты остаются FF: по стандарту это «данные недоступны»,
  // а не ноль, который приёмник примет за настоящее значение.
  const bytes = new Uint8Array(length).fill(0xff);

  const filled = [];
  const problems = [];

  for (const signal of message.signals || []) {
    const value = read(values, signal.spn);
    if (value === undefined) continue;

    // Проверяем по рабочему диапазону, а не по разрядности: значения выше потолка
    // попадают в служебный диапазон, и приёмник прочитает их как «ошибка» или
    // «данные недоступны» вместо числа.
    const outside = value !== null && !insideRange(signal, value);
    if (outside) {
      const limits = hintFor(signal);
      problems.push({
        spn: signal.spn,
        name: signal.name,
        message:
          "значение " + value + " вне рабочего диапазона " + limits.min + "…" + limits.max +
          (limits.unit ? " " + limits.unit : ""),
      });
      continue;
    }

    try {
      const packed = pack(value, signal, bytes);
      filled.push({ spn: signal.spn, name: signal.name, value, raw: packed.raw, signal });
    } catch (error) {
      problems.push({ spn: signal.spn, name: signal.name, message: error.message });
    }
  }

  return { bytes, filled, problems };
}

/**
 * Подсказка для поля ввода: рабочий диапазон и шаг.
 * Служебные значения в диапазон не входят — их задают отдельной кнопкой.
 */
export function hintFor(signal) {
  const limits = range(signal);
  return {
    min: limits.min,
    max: limits.max,
    step: Math.abs(signal.scale === undefined ? 1 : signal.scale),
    unit: signal.unit || "",
  };
}

export { STATE };

function insideRange(signal, value) {
  if (!Number.isFinite(value)) return false;
  const limits = hintFor(signal);
  // Полшага допуска: значение 250.996 при потолке 250.99609375 — это одно и то же.
  const epsilon = limits.step / 2;
  return value >= limits.min - epsilon && value <= limits.max + epsilon;
}

function read(values, spn) {
  if (values instanceof Map) return values.has(spn) ? values.get(spn) : undefined;
  if (values && typeof values === "object") {
    return Object.prototype.hasOwnProperty.call(values, spn) ? values[spn] : undefined;
  }
  return undefined;
}
