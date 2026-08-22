// Собирает все наборы тестов и печатает результат.
// Новый модуль ядра — добавить сюда импорт его *.test.js.
import "./frame.test.js";
import "./signal.test.js";
import "./id.test.js";
import { report } from "./tiny.js";

report(document.getElementById("out"));
