// Арифметика закупки: округления вверх и подбор фасовок.
// Отдельный файл, потому что это единственное место, где решается,
// сколько штук человек унесёт из магазина. Ошибка здесь дороже ошибки в формуле.

// Ошибка расчёта с текстом для человека: показываем как есть, не переводим.
export class CalcError extends Error {
  constructor(message) {
    super(message);
    this.name = "CalcError";
  }
}

// Запас на грязь двоичной арифметики: 12 / 2 иногда даёт 6.000000000000001,
// и честный Math.ceil превращает шесть упаковок в семь.
const EPS = 1e-9;

/** Округление вверх до целой единицы покупки. */
export function ceilUnits(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.ceil(value - EPS);
}

/** Округление вниз — сколько целых раз одно влезает в другое. */
export function floorUnits(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.floor(value + EPS);
}

/** Округление вверх до шага (0,1 м для рулонных материалов в погонных метрах). */
export function ceilToStep(value, step) {
  if (!Number.isFinite(value) || !(step > 0)) return 0;
  return Math.ceil(value / step - EPS) * step;
}

/** Округление вниз до знаков после запятой — только для показа, не для расчёта. */
export function round(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const k = Math.pow(10, digits);
  return Math.round(value * k) / k;
}

// Внутренний масштаб: работаем в целых тысячных, чтобы 0,9 + 2,7 не давало 3,5999999.
const SCALE = 1000;
// Потолок перебора: банок больше этого числа в комнате не бывает, а массив
// динамического программирования на больших объёмах разрастается зря.
const SEARCH_LIMIT = 64;

/**
 * Подбор набора фасовок под нужный объём с минимальным перерасходом.
 * Комбинация разрешена: 2,88 л из ряда 0,9 / 2,7 / 9 — это 2,7 + 0,9, а не одна банка 9 л.
 *
 * Критерий двойной и именно в этом порядке:
 *   1. меньше излишка,
 *   2. при равном излишке — меньше банок (2,7 + 0,9 вместо четырёх по 0,9).
 *
 * @param {number} need сколько нужно, в тех же единицах, что и sizes
 * @param {number[]} sizes ряд фасовок
 * @returns {{picks: {size: number, count: number}[], total: number, surplus: number}}
 */
export function choosePacks(need, sizes) {
  const list = Array.from(new Set((sizes || []).map((s) => Math.round(s * SCALE))))
    .filter((s) => s > 0)
    .sort((a, b) => a - b);

  if (!list.length) throw new CalcError("Не задан ряд фасовок");

  const wanted = Math.max(0, Math.ceil(need * SCALE - EPS * SCALE));
  if (wanted === 0) return { picks: [], total: 0, surplus: 0 };

  const largest = list[list.length - 1];
  // Крупные фасовки сверх лимита набираем сразу: на больших объёмах они всё равно
  // войдут в ответ, а перебирать их поштучно незачем.
  const preset = Math.max(0, Math.floor(wanted / largest) - SEARCH_LIMIT);
  const target = wanted - preset * largest;

  const ceiling = target + largest;
  const packs = new Array(ceiling + 1).fill(Infinity);
  const from = new Array(ceiling + 1).fill(0);
  packs[0] = 0;

  for (let t = 1; t <= ceiling; t++) {
    for (const size of list) {
      if (size > t) break;
      if (packs[t - size] + 1 < packs[t]) {
        packs[t] = packs[t - size] + 1;
        from[t] = size;
      }
    }
  }

  // Первый достижимый объём не меньше нужного — он же и с минимальным излишком.
  let total = -1;
  for (let t = target; t <= ceiling; t++) {
    if (packs[t] !== Infinity) {
      total = t;
      break;
    }
  }
  if (total < 0) throw new CalcError("Не удалось подобрать фасовку под объём " + round(need, 2));

  const counts = new Map();
  for (let t = total; t > 0; t -= from[t]) {
    counts.set(from[t], (counts.get(from[t]) || 0) + 1);
  }
  if (preset > 0) counts.set(largest, (counts.get(largest) || 0) + preset);

  const picks = Array.from(counts, ([size, count]) => ({ size: size / SCALE, count }))
    .sort((a, b) => b.size - a.size);

  const totalScaled = total + preset * largest;
  return {
    picks,
    total: totalScaled / SCALE,
    surplus: (totalScaled - wanted) / SCALE,
  };
}
