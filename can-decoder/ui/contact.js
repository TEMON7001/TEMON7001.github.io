// Связь с разработчиком и честная пометка про коды неисправностей.
// Приложение ничего не отправляет само: письмо пишет человек, вручную, из своей почты.

import { escapeHtml } from "./result-view.js";

/** Адрес меняется здесь и больше нигде. */
export const FEEDBACK_EMAIL = "temongelios@gmail.com";

const LOG_SUBJECT = "CAN Дешифратор — лог с техники";
const LOG_BODY =
  "Приложите файл лога с шины.\n\n" +
  "Напишите, пожалуйста:\n" +
  "— марка и модель машины,\n" +
  "— чем снимали лог,\n" +
  "— что за неисправность искали, если знаете.\n\n" +
  "Лог нужен, чтобы научить приложение разбирать коды неисправностей.";

/** Ссылка на письмо с логом: тема и тело заполнены, отправляет человек сам. */
export function logMailtoHref() {
  return (
    "mailto:" + FEEDBACK_EMAIL +
    "?subject=" + encodeURIComponent(LOG_SUBJECT) +
    "&body=" + encodeURIComponent(LOG_BODY)
  );
}

/** Кнопка «Прислать лог» — обычная ссылка, открывает почтовый клиент. */
export function sendLogButton(label = "Прислать лог") {
  return '<a class="chip" href="' + logMailtoHref() + '">' + escapeHtml(label) + "</a>";
}

/**
 * Пометка для сообщений с кодами неисправностей.
 * @param {number} pgn номер сообщения
 * @param {{faultCodePgns: number[]}} protocol
 * @returns {string} разметка или пустая строка
 */
export function faultNoticeCard(pgn, protocol) {
  if (!protocol.faultCodePgns.includes(pgn)) return "";
  return (
    '<div class="card card-unknown">' +
      "<p><strong>Коды неисправностей не разбираются</strong></p>" +
      '<p class="hint">Лампы выше читаются, а список кодов в этой версии не разбирается: ' +
      "у нас нет логов с реальной техники, а неверный код хуже отсутствующего — " +
      "по нему поедут чинить не то. Пришлите лог, и разбор появится.</p>" +
      '<div class="input-tools">' + sendLogButton() + "</div>" +
    "</div>"
  );
}

/** Короткая пометка строкой — для списка сообщений в логе. */
export function faultNoticeLine(pgn, protocol) {
  if (!protocol.faultCodePgns.includes(pgn)) return "";
  return '<p class="hint">Коды неисправностей не разбираются, читаются только лампы.</p>';
}
