// Геометрия комнаты — единственный источник площадей и периметров.
// Все расчёты материалов берут числа отсюда и больше нигде их не выводят:
// размеры человек вводит один раз, и разойтись эти числа не должны нигде.
// DOM тут нет — только числа на входе и числа на выходе.

// Контрольная комната из ТЗ. Она же — значения по умолчанию:
// поля не должны встречать человека пустыми.
export const DEFAULT_ROOM = {
  length: 4,
  width: 3,
  height: 2.7,
  doors: 1,
  doorWidth: 0.9,
  doorHeight: 2.1,
  windows: 1,
  windowWidth: 1.5,
  windowHeight: 1.4,
};

// Выше этих значений размер почти наверняка опечатка: комнату 40 метров
// считать не откажемся, но предупредим.
const SANE = { size_m: 30, height_m: 5 };

/**
 * @param {object} input сырые значения полей, любые типы
 * @returns {object} размеры + производные величины + список замечаний
 */
export function computeRoom(input) {
  const room = normalize(input);

  const perimeter = 2 * (room.length + room.width);
  const floorArea = room.length * room.width;
  const wallsGross = perimeter * room.height;
  const openingsArea =
    room.doors * room.doorWidth * room.doorHeight +
    room.windows * room.windowWidth * room.windowHeight;

  const geometry = {
    ...room,
    perimeter,
    floorArea,
    ceilingArea: floorArea,
    wallsGross,
    openingsArea,
    // Проёмы больше стен — ошибка ввода, но отрицательная площадь ломала бы всё дальше.
    wallsNet: Math.max(0, wallsGross - openingsArea),
    // Периметр без дверных проёмов: по ним не идут ни обои, ни плинтус.
    perimeterNet: Math.max(0, perimeter - room.doors * room.doorWidth),
  };

  geometry.valid = floorArea > 0 && room.height > 0;
  geometry.warnings = checkRoom(geometry);
  return geometry;
}

function checkRoom(g) {
  const warnings = [];

  if (!(g.length > 0) || !(g.width > 0) || !(g.height > 0)) {
    warnings.push("Заполните длину, ширину и высоту комнаты — без них считать нечего.");
    return warnings;
  }
  if (g.openingsArea >= g.wallsGross) {
    warnings.push("Проёмы занимают всю площадь стен. Проверьте размеры дверей и окон.");
  }
  if (g.doors > 0 && g.doors * g.doorWidth >= g.perimeter) {
    warnings.push("Двери шире периметра комнаты. Проверьте ширину и количество дверей.");
  }
  if (g.length > SANE.size_m || g.width > SANE.size_m) {
    warnings.push("Размеры больше " + SANE.size_m + " м — это уже не комната. Проверьте, не метры ли перепутаны с сантиметрами.");
  }
  if (g.height > SANE.height_m) {
    warnings.push("Высота " + fmt(g.height) + " м — проверьте значение: расход материалов вырастет соответственно.");
  }
  return warnings;
}

// Числа приходят из полей ввода строками, а из localStorage — чем угодно.
// Приводим здесь один раз, чтобы дальше по коду не было проверок на NaN.
function normalize(input) {
  const source = input || {};
  const out = {};
  for (const key of Object.keys(DEFAULT_ROOM)) {
    out[key] = positive(source[key]);
  }
  out.doors = Math.round(out.doors);
  out.windows = Math.round(out.windows);
  return out;
}

function positive(value) {
  const number = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function fmt(value) {
  return String(value).replace(".", ",");
}
