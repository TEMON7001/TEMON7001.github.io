// Собирает все наборы тестов и печатает результат.
// Новый модуль ядра — добавить сюда импорт его *.test.js.
import "./frame.test.js";
import "./signal.test.js";
import "./id.test.js";
import { run as runCatalog } from "./catalog.test.js";
import { run as runResolve } from "./resolve.test.js";
import { report } from "./tiny.js";

// Наборы, которым нужны файлы данных, получают их готовыми:
// так сами тесты остаются синхронными и простыми.
const [seed, vectors] = await Promise.all([
  fetch("../data/j1939-pgn.json").then((r) => r.json()),
  fetch("./test-vectors.json").then((r) => r.json()),
]);

runCatalog(seed);
runResolve(seed, vectors);

report(document.getElementById("out"));
