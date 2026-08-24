// Как справочник J1939 выглядит для поиска: сообщения, параметры и коды отказов
// превращаются в однотипные записи. Ядро поиска про эти сущности не знает.

import { pgnToHex } from "./id.js";

export const ENTRY = {
  MESSAGE: "message",
  SIGNAL: "signal",
  FAULT: "fault",
};

/**
 * @param {object} catalog из core/catalog.js
 * @param {Array<{fmi: number, description: string}>} faultCodes из data/fmi.json
 */
export function makeEntries(catalog, faultCodes = []) {
  const entries = [];

  for (const message of [...catalog.messages, ...catalog.serviceMessages]) {
    entries.push({
      id: "pgn-" + message.pgn,
      kind: ENTRY.MESSAGE,
      // Сообщение весит больше параметра: по номеру PGN и акрониму сначала показываем его.
      weight: 2,
      title: message.acronym || message.name,
      subtitle: message.acronym ? message.name : "",
      // Номер ищут и в десятичном виде, и в hex, и с приставкой, и без неё.
      terms: [
        message.pgn,
        "pgn " + message.pgn,
        pgnToHex(message.pgn),
        pgnToHex(message.pgn).slice(2),
        message.acronym,
        message.name,
        message.kind === "service" ? "служебное" : "",
      ],
      data: message,
    });

    for (const signal of message.signals || []) {
      entries.push({
        id: "spn-" + message.pgn + "-" + signal.spn,
        kind: ENTRY.SIGNAL,
        title: signal.name,
        subtitle: (message.acronym || message.name) + " · PGN " + message.pgn,
        terms: [
          signal.spn,
          "spn " + signal.spn,
          signal.name,
          signal.unit,
          message.acronym,
          message.pgn,
        ],
        data: { message, signal },
      });
    }
  }

  for (const fault of faultCodes) {
    entries.push({
      id: "fmi-" + fault.fmi,
      kind: ENTRY.FAULT,
      title: "FMI " + fault.fmi,
      subtitle: fault.description,
      terms: [fault.fmi, "fmi " + fault.fmi, fault.description, "неисправность", "отказ"],
      data: fault,
    });
  }

  return entries;
}
