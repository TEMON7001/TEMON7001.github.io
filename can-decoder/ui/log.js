import { stub } from "./_stub.js";

export const meta = { id: "log", title: "Разбор лога", short: "Лог", icon: "📄" };

export function mount(root) {
  stub(root, {
    title: "Разбор лога",
    lead: "Дамп с шины целиком: какие PGN идут, как часто, что в них.",
    points: [
      "Загрузка файла или вставка текстом",
      "Форматы candump (SocketCAN) и произвольный csv/текст",
      "Список PGN: количество кадров и частота, фильтр по PGN и SA",
      "Нераспознанные PGN — отдельным списком, не прячем",
    ],
    task: "T8",
  });
}
