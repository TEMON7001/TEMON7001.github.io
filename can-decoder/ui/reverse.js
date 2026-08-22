import { stub } from "./_stub.js";

export const meta = { id: "reverse", title: "Обратный расчёт", short: "Обратно", icon: "🧮" };

export function mount(root) {
  stub(root, {
    title: "Обратный расчёт",
    lead: "Формирование кадра по заданному значению параметра.",
    points: [
      "Выбор PGN, затем SPN",
      "Ввод значения в единицах параметра",
      "Готовый кадр в hex и побайтовая раскладка",
      "Незаполненные байты — FF, по стандарту это «данные недоступны»",
    ],
    task: "T9",
  });
}
