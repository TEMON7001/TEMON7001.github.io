import { stub } from "./_stub.js";

export const meta = { id: "cheatsheet", title: "Шпаргалка", short: "Памятка", icon: "💡" };

export function mount(root) {
  stub(root, {
    title: "Шпаргалка",
    lead: "То, что забывается между выездами. Открывается без сети, у машины.",
    points: [
      "Структура 29-битного ID по полям",
      "PDU1 и PDU2: когда PS — это адрес, а когда часть PGN",
      "Порядок байт в J1939 и почему он «наоборот»",
      "Что значит FF в байте и когда это не ошибка",
    ],
    task: "T11",
  });
}
