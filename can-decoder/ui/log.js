import { stub } from "./_stub.js";

export const meta = { id: "log", title: "Разбор лога", short: "Лог", icon: "📄" };

export function mount(root) {
  stub(root, {
    title: "Разбор лога",
    lead: "Разбор файла лога целиком: состав сообщений, частота, содержимое кадров.",
    points: [
      "Загрузка файла или вставка текстом",
      "Форматы candump (SocketCAN) и произвольный csv/текст",
      "Список PGN: количество кадров и частота, фильтр по PGN и SA",
      "Нераспознанные PGN выводятся отдельным списком",
    ],
    task: "T8",
  });
}
