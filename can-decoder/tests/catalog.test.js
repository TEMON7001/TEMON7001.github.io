import { makeCatalog, CatalogError } from "../core/catalog.js";
import { suite, test, eq, throwsWith } from "./tiny.js";

// Минимальный корректный справочник — от него отталкиваемся, ломая по одной вещи за раз.
function base() {
  return {
    format_version: 1,
    protocol: "SAE J1939",
    messages: [
      {
        pgn: 61444,
        pgn_hex: "0xF004",
        acronym: "EEC1",
        name: "Электронный контроллер двигателя 1",
        length: 8,
        rate_ms: 20,
        signals: [
          {
            spn: 190,
            name: "Обороты двигателя",
            start_bit: 24,
            length_bits: 16,
            byte_order: "little",
            scale: 0.125,
            offset: 0,
            unit: "об/мин",
            min: 0,
            max: 8031.875,
            type: "number",
            doc_pos: "4.1",
          },
        ],
      },
    ],
    service_messages: [{ pgn: 60416, pgn_hex: "0xEC00", acronym: "TP.CM", name: "Транспортный протокол" }],
  };
}

function broken(change) {
  const raw = base();
  change(raw, raw.messages[0], raw.messages[0].signals[0]);
  return raw;
}

export function run(seed) {
  suite("core/catalog.js — рабочий справочник");

  test("минимальный справочник проходит проверку", () => {
    const catalog = makeCatalog(base());
    eq(catalog.messages.length, 1, "сообщений");
    eq(catalog.serviceMessages.length, 1, "служебных сообщений");
    eq(catalog.problems.length, 0, "ошибок");
    eq(catalog.warnings.length, 0, "замечаний");
  });

  test("seed-справочник coworker'а проходит проверку целиком", () => {
    const catalog = makeCatalog(seed);
    eq(catalog.problems.length, 0, "ошибок в данных");
    eq(catalog.messages.length, 13, "сообщений с сигналами");
    eq(catalog.serviceMessages.length, 5, "служебных сообщений");
  });

  test("сообщение находится по номеру", () => {
    const catalog = makeCatalog(seed);
    eq(catalog.find(61444).acronym, "EEC1", "по номеру PGN");
    eq(catalog.find(60416).kind, "service", "служебное помечено");
    eq(catalog.find(65248), null, "неизвестного номера нет");
  });

  test("все сигналы справочника доступны одним списком — для поиска", () => {
    const catalog = makeCatalog(seed);
    const all = catalog.signals();
    eq(all.length, 80, "сигналов всего");
    eq(all.some((x) => x.signal.spn === 190), true, "обороты на месте");
  });

  suite("core/catalog.js — валидатор ловит ошибки в данных");

  test("сигнал вылезает за длину сообщения", () => {
    throwsWith(
      () => makeCatalog(broken((raw, msg, sig) => (sig.start_bit = 56))),
      "занимает 9 байт, а в сообщении 8"
    );
  });

  test("сигналы пересекаются", () => {
    throwsWith(
      () =>
        makeCatalog(
          broken((raw, msg, sig) => {
            msg.signals.push({ ...sig, spn: 191, start_bit: 32, doc_pos: "5.1" });
          })
        ),
      "уже занят сигналом SPN 190"
    );
  });

  test("max выше физического потолка — замечание, а не отказ", () => {
    const catalog = makeCatalog(broken((raw, msg, sig) => (sig.max = 9000)));
    eq(catalog.problems.length, 0, "ошибок нет");
    eq(catalog.warnings.some((w) => w.includes("выше физического потолка")), true, "замечание есть");
    eq(catalog.warnings.every((w) => w.includes("PGN")), true, "в замечании назван PGN");
  });

  test("min ниже физического минимума — тоже замечание", () => {
    const catalog = makeCatalog(broken((raw, msg, sig) => (sig.min = -10)));
    eq(catalog.warnings.some((w) => w.includes("ниже физического минимума")), true, "замечание есть");
  });

  test("параметр без служебных значений считается по всей разрядности", () => {
    // Адрес устройства занимает весь диапазон 0–255, FF там не «нет данных».
    const catalog = makeCatalog(
      broken((raw, msg, sig) => {
        sig.length_bits = 8;
        sig.start_bit = 40;
        sig.doc_pos = "6.1";
        sig.scale = 1;
        sig.max = 255;
        sig.special_values = "none";
      })
    );
    eq(catalog.warnings.length, 0, "замечаний нет");
  });

  test("min больше max", () => {
    throwsWith(
      () =>
        makeCatalog(
          broken((raw, msg, sig) => {
            sig.min = 100;
            sig.max = 50;
          })
        ),
      "min больше max"
    );
  });

  test("один PGN описан дважды", () => {
    throwsWith(
      () => makeCatalog(broken((raw, msg) => raw.messages.push({ ...msg }))),
      "описан больше одного раза"
    );
  });

  test("один SPN дважды в одном сообщении", () => {
    throwsWith(
      () =>
        makeCatalog(
          broken((raw, msg, sig) => {
            msg.signals.push({ ...sig, start_bit: 0, doc_pos: "1.1", length_bits: 8, max: 31.875 });
          })
        ),
      "такой SPN в этом сообщении уже есть"
    );
  });

  test("перечисление без подписей", () => {
    throwsWith(() => makeCatalog(broken((raw, msg, sig) => (sig.type = "enum"))), "нет ни одной подписи");
  });

  test("код перечисления не помещается в разрядность", () => {
    throwsWith(
      () =>
        makeCatalog(
          broken((raw, msg, sig) => {
            sig.length_bits = 2;
            sig.start_bit = 0;
            sig.type = "enum";
            sig.values = { 0: "выключено", 9: "чего-то" };
            sig.max = 3;
            sig.doc_pos = "1.1";
          })
        ),
      "не помещается в 2 бит"
    );
  });

  test("pgn_hex не соответствует номеру", () => {
    throwsWith(() => makeCatalog(broken((raw, msg) => (msg.pgn_hex = "0xF005"))), "не соответствует номеру");
  });

  test("doc_pos не сходится со start_bit — опечатка при подготовке данных", () => {
    throwsWith(() => makeCatalog(broken((raw, msg, sig) => (sig.doc_pos = "5.1"))), "это start_bit 32");
  });

  test("нет названия у сообщения", () => {
    throwsWith(() => makeCatalog(broken((raw, msg) => (msg.name = ""))), "нет названия");
  });

  test("сообщение без сигналов", () => {
    throwsWith(() => makeCatalog(broken((raw, msg) => (msg.signals = []))), "нет ни одного сигнала");
  });

  test("кривой byte_order", () => {
    throwsWith(() => makeCatalog(broken((raw, msg, sig) => (sig.byte_order = "middle"))), "little или big");
  });

  test("кривая длина сигнала", () => {
    throwsWith(() => makeCatalog(broken((raw, msg, sig) => (sig.length_bits = 0))), "length_bits");
  });

  test("в каждой ошибке назван PGN", () => {
    let caught = null;
    try {
      makeCatalog(broken((raw, msg, sig) => (sig.start_bit = 56)));
    } catch (error) {
      caught = error;
    }
    eq(caught instanceof CatalogError, true, "тип ошибки");
    eq(caught.problems.length > 0, true, "ошибки перечислены");
    eq(caught.problems.every((p) => p.includes("PGN")), true, "в каждой ошибке есть PGN");
  });

  test("испорченный seed-файл роняет валидатор с указанием PGN", () => {
    const copy = JSON.parse(JSON.stringify(seed));
    // Сдвигаем обороты на бит: теперь они лезут в соседний сигнал.
    const eec1 = copy.messages.find((m) => m.pgn === 61444);
    const rpm = eec1.signals.find((s) => s.spn === 190);
    rpm.start_bit = 23;
    rpm.doc_pos = "3.8";
    throwsWith(() => makeCatalog(copy), "PGN 61444, SPN 190");
  });

  suite("core/catalog.js — нестрогий режим для телефона");

  test("кривое сообщение выбрасывается, остальные работают", () => {
    const raw = base();
    raw.messages.push({
      pgn: 65262,
      pgn_hex: "0xFEEE",
      name: "Кривое",
      length: 8,
      signals: [{ spn: 110, name: "Температура", start_bit: 60, length_bits: 16 }],
    });
    const catalog = makeCatalog(raw, { strict: false });
    eq(catalog.messages.length, 1, "осталось сообщений");
    eq(catalog.find(61444) !== null, true, "хорошее на месте");
    eq(catalog.find(65262), null, "кривое выброшено");
    eq(catalog.problems.length > 0, true, "ошибка записана");
  });

  test("пустой справочник — сразу ошибка", () => throwsWith(() => makeCatalog(null), "пуст"));
}
