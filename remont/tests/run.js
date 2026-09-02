// Собирает все наборы тестов и печатает результат.
// Новый модуль ядра — добавить сюда импорт его *.test.js.
import "./room.test.js";
import "./units.test.js";
import { run as runMaterials } from "./materials.test.js";
import { run as runWorks } from "./works.test.js";
import { run as runList } from "./list.test.js";
import { report } from "./tiny.js";

// Справочник расходов и фасовок приходит готовым, чтобы сами тесты
// оставались синхронными и простыми.
const data = await fetch("../data/materials.json").then((r) => r.json());

runMaterials(data);
runWorks(data);
runList(data);

report(document.getElementById("out"));
