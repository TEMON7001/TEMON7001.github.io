import { stub } from "./_stub.js";

export const meta = { id: "cheatsheet", title: "Шпаргалка", short: "Памятка", icon: "💡" };

export function mount(root) {
  stub(root, {
    title: "Шпаргалка",
    lead: "Краткая справка по структуре J1939. Доступна без сети.",
    points: [
      "Структура 29-битного ID по полям",
      "PDU1 и PDU2: когда PS — это адрес, а когда часть PGN",
      "Порядок байт в J1939",
      "Значение FF в байте и случаи, когда это не ошибка",
    ],
    task: "T11",
  });
}
