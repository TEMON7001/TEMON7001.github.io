// Собирает все наборы тестов и печатает результат.
// Новый модуль ядра — добавить сюда импорт его *.test.js.
import "./frame.test.js";
import "./signal.test.js";
import "./id.test.js";
import { run as runCatalog } from "./catalog.test.js";
import { run as runResolve } from "./resolve.test.js";
import { run as runSearch } from "./search.test.js";
import { run as runImport } from "./import.test.js";
import { run as runCompose } from "./compose.test.js";
import { run as runContact } from "./contact.test.js";
import { report } from "./tiny.js";

// Наборы, которым нужны файлы данных, получают их готовыми:
// так сами тесты остаются синхронными и простыми.
const [seed, vectors, faults] = await Promise.all([
  fetch("../data/j1939-pgn.json").then((r) => r.json()),
  fetch("./test-vectors.json").then((r) => r.json()),
  fetch("../data/fmi.json").then((r) => r.json()),
]);

runCatalog(seed);
runResolve(seed, vectors);
runSearch(seed, faults.fmi);
runImport(seed);
runCompose(seed);
runContact();

report(document.getElementById("out"));
