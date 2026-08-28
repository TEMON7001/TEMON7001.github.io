import { FEEDBACK_EMAIL, logMailtoHref, sendLogButton, faultNoticeCard, faultNoticeLine } from "../ui/contact.js";
import { j1939 } from "../protocols/j1939/index.js";
import { suite, test, eq } from "./tiny.js";

export function run() {
  suite("ui/contact.js — просьба прислать лог");

  test("адрес задан в одном месте", () => eq(FEEDBACK_EMAIL, "temongelios@gmail.com", "адрес"));

  test("ссылка ведёт в почтовый клиент с заполненной темой", () => {
    const href = logMailtoHref();
    eq(href.startsWith("mailto:" + FEEDBACK_EMAIL), true, "адрес получателя");
    eq(href.includes("subject=" + encodeURIComponent("CAN Дешифратор — лог с техники")), true, "тема письма");
    eq(href.includes("body="), true, "тело письма");
  });

  test("в теле письма просят марку машины", () => {
    eq(decodeURIComponent(logMailtoHref()).includes("марка и модель машины"), true, "текст письма");
  });

  test("кнопка — обычная ссылка, без скриптов", () => {
    const html = sendLogButton();
    eq(html.startsWith("<a "), true, "это ссылка");
    eq(html.includes("mailto:"), true, "адрес на месте");
    eq(html.includes("onclick"), false, "никаких обработчиков");
  });

  suite("ui/contact.js — пометка про коды неисправностей");

  test("DM1 и DM2 помечаются", () => {
    eq(faultNoticeCard(65226, j1939).includes("Коды неисправностей не разбираются"), true, "DM1");
    eq(faultNoticeCard(65227, j1939).includes("Коды неисправностей не разбираются"), true, "DM2");
  });

  test("остальные сообщения не помечаются", () => {
    eq(faultNoticeCard(61444, j1939), "", "EEC1 без пометки");
    eq(faultNoticeLine(65262, j1939), "", "ET1 без пометки");
  });

  test("в пометке есть кнопка «Прислать лог»", () => {
    eq(faultNoticeCard(65226, j1939).includes("Прислать лог"), true, "кнопка на месте");
  });

  test("строчная пометка для списка лога короткая", () => {
    const line = faultNoticeLine(65226, j1939);
    eq(line.includes("читаются только лампы"), true, "текст");
    eq(line.length < 200, true, "строка короткая, список не разъезжается");
  });
}
