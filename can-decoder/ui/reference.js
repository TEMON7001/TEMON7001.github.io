import { stub } from "./_stub.js";

export const meta = { id: "reference", title: "Справочник", short: "Справка", icon: "📚" };

export function mount(root) {
  stub(root, {
    title: "Справочник",
    lead: "Единый поиск по справочнику, в том числе по неполному запросу.",
    points: [
      "Номер PGN в десятичном и hex виде: 61444, F004",
      "Acronym и название: EEC1, «оборот»",
      "Номер SPN: SPN 190",
      "Код неисправности: FMI 3",
    ],
    task: "T7",
  });
}
