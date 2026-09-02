// Сборка единого списка закупки: комната плюс выбранные работы дают позиции
// по разделам. Ради этого приложение и существует — человек не складывает
// результаты пяти калькуляторов на бумаге, а получает один список.

import { GROUPS, EXTRAS, chosen } from "./works.js";
import { CalcError } from "./units.js";
import { formatQty, formatMoney, parseMoney } from "./plural.js";
import * as materials from "./materials.js";

export const SECTIONS = [
  { id: "walls", title: "Стены" },
  { id: "floor", title: "Пол" },
  { id: "ceiling", title: "Потолок" },
  { id: "other", title: "Прочее" },
];

/**
 * @returns {{sections: object[], items: object[], chosen: number, needsRoom: boolean}}
 *   sections — разделы с позициями и сообщениями о том, что посчитать не удалось;
 *   items — те же позиции подряд, для цен и итога;
 *   chosen — сколько работ выбрано, чтобы отличить «ничего не выбрано» от «не считается».
 */
export function buildList(geom, works, params, data) {
  const sections = SECTIONS.map((s) => ({ ...s, items: [], problems: [] }));
  const byId = new Map(sections.map((s) => [s.id, s]));
  const result = { sections, items: [], chosen: 0, needsRoom: !geom.valid };

  const picked = [];
  for (const group of GROUPS) {
    const option = chosen(works, group);
    if (option.calc) picked.push({ option, section: byId.get(group.id) });
  }
  for (const extra of EXTRAS) {
    if (works[extra.id]) picked.push({ option: extra, section: byId.get("other") });
  }

  result.chosen = picked.length;
  // Без размеров считать нечего, и десять одинаковых сообщений «не заданы размеры»
  // человеку ничего не объясняют: экран скажет это один раз сам.
  if (!geom.valid) return result;

  for (const { option, section } of picked) {
    try {
      const own = params[option.params] || {};
      const items = materials[option.calc](geom, own, data, works);
      section.items.push(...items);
      result.items.push(...items);
    } catch (error) {
      // Ошибка расчёта — это сообщение для человека, а не сбой: остальной список
      // должен собраться. Всё прочее пробрасываем, это ошибка в коде.
      if (!(error instanceof CalcError)) throw error;
      section.problems.push({ name: option.name, message: error.message });
    }
  }

  return result;
}

// ==== Деньги ====

/** Сумма строки: количество × цена. Без цены суммы нет — это не ноль. */
export function lineSum(item, prices) {
  const price = parseMoney(prices[item.id]);
  return price === null ? null : item.qty * price;
}

/**
 * Итоги по списку. Позиции без цены итог не ломают: они не входят в сумму,
 * но пересчитываются отдельно, чтобы человек видел, что итог неполный.
 */
export function totals(items, prices, bought) {
  let total = 0;
  let remaining = 0;
  let unpriced = 0;

  for (const item of items) {
    const sum = lineSum(item, prices);
    if (sum === null) {
      unpriced++;
      continue;
    }
    total += sum;
    if (!bought[item.id]) remaining += sum;
  }

  return { total, remaining, unpriced, priced: items.length - unpriced };
}

/**
 * Список простым текстом — чтобы отправить в мессенджер или показать в магазине.
 * Формат нарочно бедный: никакой разметки, ничего, что развалится при пересылке.
 */
export function toText(list, geom, prices, bought) {
  const lines = [
    "Ремонт комнаты " + dim(geom.length) + " × " + dim(geom.width) + " × " + dim(geom.height),
  ];

  for (const section of list.sections) {
    if (!section.items.length) continue;
    lines.push("", section.title.toUpperCase());
    for (const item of section.items) {
      lines.push(
        item.name + " — " + formatQty(item.qty, item.unit) + (bought[item.id] ? " (куплено)" : "")
      );
    }
  }

  const sums = totals(list.items, prices, bought);
  if (sums.priced > 0) {
    lines.push("", "Итого: " + formatMoney(sums.total));
    if (sums.remaining !== sums.total) {
      lines.push("Осталось купить на " + formatMoney(sums.remaining));
    }
  }
  if (sums.unpriced > 0) {
    lines.push(formatQty(sums.unpriced, "позиция") + " без цены");
  }

  return lines.join("\n");
}

// Размер в заголовке: 4,0 × 3,0 × 2,7. Один знак после запятой обязателен —
// «4 × 3 × 2,7» читается как прикидка, а не как замер.
function dim(value) {
  return Number(value).toFixed(2).replace(/0$/, "").replace(".", ",");
}
