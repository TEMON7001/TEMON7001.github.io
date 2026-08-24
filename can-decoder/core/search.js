// Поиск по справочнику. Файл не знает ни про PGN, ни про SPN, ни про FMI:
// на вход приходят записи с набором поисковых слов, что это за записи — решает вызывающий.

const MAX_RESULTS = 40;

/**
 * Готовит записи к поиску: раскладывает слова один раз, а не на каждый запрос.
 * @param {Array<{id, kind, title, subtitle, terms: string[], weight?: number, data}>} entries
 */
export function buildIndex(entries) {
  return entries.map((entry) => ({
    ...entry,
    // Каждое слово названия — отдельное слово поиска: «оборот» должен находить
    // «Обороты двигателя», а не только запрос с начала строки.
    words: unique(entry.terms.flatMap(expand)),
  }));
}

/**
 * @param {Array} index результат buildIndex
 * @param {string} query запрос пользователя
 * @returns {Array} записи, отсортированные по совпадению
 */
export function search(index, query, limit = MAX_RESULTS) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  const found = [];
  for (const entry of index) {
    // Все слова запроса должны найтись: «FMI 3» это код 3, а не всё подряд со словом FMI.
    let score = 0;
    let matchedAll = true;
    for (const token of tokens) {
      const best = scoreToken(entry.words, token);
      if (best === 0) {
        matchedAll = false;
        break;
      }
      score += best;
    }
    if (matchedAll) found.push({ entry, score });
  }

  // При равном совпадении вперёд идёт запись с большим весом: по запросу «EEC1»
  // человек ждёт само сообщение, а не первый попавшийся его параметр.
  found.sort(
    (a, b) =>
      b.score - a.score ||
      (b.entry.weight || 0) - (a.entry.weight || 0) ||
      a.entry.title.localeCompare(b.entry.title, "ru")
  );
  return found.slice(0, limit).map((item) => item.entry);
}

function scoreToken(words, token) {
  let best = 0;
  for (const word of words) {
    if (word === token) best = Math.max(best, 5);
    else if (word.startsWith(token)) best = Math.max(best, 3);
    else if (word.includes(token)) best = Math.max(best, 1);
  }
  return best;
}

// Запрос и слова записи режем одинаково: по пробелам и знакам,
// чтобы «SPN 190», «spn190» и «190» вели к одному результату.
function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^0-9a-zа-яё./-]+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function expand(term) {
  const value = String(term === undefined || term === null ? "" : term).toLowerCase();
  if (!value) return [];
  return [value, ...tokenize(value)];
}

function unique(list) {
  return Array.from(new Set(list));
}
