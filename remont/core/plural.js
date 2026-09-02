// Русские окончания единиц покупки. «5 рулонов», а не «5 рулон».
// Позиции хранят единицу одной формой (unit: "рулон"), склонение живёт только здесь.

const FORMS = {
  "рулон":        ["рулон", "рулона", "рулонов"],
  "упаковка":     ["упаковка", "упаковки", "упаковок"],
  "мешок":        ["мешок", "мешка", "мешков"],
  "банка":        ["банка", "банки", "банок"],
  "пачка":        ["пачка", "пачки", "пачек"],
  "канистра":     ["канистра", "канистры", "канистр"],
  "планка":       ["планка", "планки", "планок"],
  "плитка":       ["плитка", "плитки", "плиток"],
  "порожек":      ["порожек", "порожка", "порожков"],
  "соединитель":  ["соединитель", "соединителя", "соединителей"],
  "шт":           ["шт", "шт", "шт"],
  "м²":           ["м²", "м²", "м²"],
  "пог. м":       ["пог. м", "пог. м", "пог. м"],
};

/** Форма единицы для количества: plural(5, "рулон") → "рулонов". */
export function plural(count, unit) {
  const forms = FORMS[unit];
  if (!forms) return unit;

  const n = Math.abs(Math.round(count));
  const tail = n % 10;
  const hundred = n % 100;

  if (tail === 1 && hundred !== 11) return forms[0];
  if (tail >= 2 && tail <= 4 && (hundred < 12 || hundred > 14)) return forms[1];
  return forms[2];
}

/** Число в русском виде: 2,88 — запятая, лишние нули убраны. */
export function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  const text = Number(value.toFixed(digits)).toString();
  return text.replace(".", ",");
}

/** «5 рулонов», «1 пачка», «12,6 м²». */
export function formatQty(count, unit) {
  return formatNumber(count) + " " + plural(count, unit);
}
