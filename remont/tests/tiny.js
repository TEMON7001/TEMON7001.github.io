// Микро-фреймворк для тестов: без npm, без сборщика, запускается страницей tests/index.html
// прямо в том же браузере, где живёт приложение. Взят из can-decoder без изменений,
// кроме заголовка страницы.

const results = [];
let currentSuite = "без раздела";

export function suite(name) {
  currentSuite = name;
}

export function test(name, fn) {
  try {
    fn();
    results.push({ suite: currentSuite, name, ok: true });
  } catch (error) {
    results.push({ suite: currentSuite, name, ok: false, message: String(error && error.message || error) });
  }
}

export function eq(actual, expected, what = "значение") {
  if (!Object.is(actual, expected)) {
    throw new Error(what + ": получено " + show(actual) + ", ожидалось " + show(expected));
  }
}

export function close(actual, expected, epsilon = 1e-9, what = "значение") {
  if (!(Math.abs(actual - expected) <= epsilon)) {
    throw new Error(what + ": получено " + show(actual) + ", ожидалось " + show(expected) + " ±" + epsilon);
  }
}

// Проверяем не только факт ошибки, но и что в тексте есть подсказка для пользователя.
export function throwsWith(fn, fragment, what = "ошибка") {
  let thrown = null;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  if (!thrown) throw new Error(what + ": ошибки не было, а должна быть");
  const message = String(thrown.message || thrown);
  if (!message.toLowerCase().includes(String(fragment).toLowerCase())) {
    throw new Error(what + ': в тексте ошибки нет «' + fragment + "», получено: " + message);
  }
}

function show(value) {
  if (typeof value === "string") return '"' + value + '"';
  return String(value);
}

export function report(root) {
  const failed = results.filter((r) => !r.ok);
  const bySuite = new Map();
  for (const r of results) {
    if (!bySuite.has(r.suite)) bySuite.set(r.suite, []);
    bySuite.get(r.suite).push(r);
  }

  const head =
    '<p class="summary ' + (failed.length ? "bad" : "good") + '">' +
    (failed.length
      ? "Провалено " + failed.length + " из " + results.length
      : "Все " + results.length + " тестов прошли") +
    "</p>";

  const body = Array.from(bySuite, ([name, list]) => {
    const rows = list
      .map(
        (r) =>
          '<li class="' + (r.ok ? "ok" : "fail") + '">' +
          (r.ok ? "✓ " : "✗ ") +
          escape(r.name) +
          (r.ok ? "" : '<br><span class="msg">' + escape(r.message) + "</span>") +
          "</li>"
      )
      .join("");
    return "<h2>" + escape(name) + "</h2><ul>" + rows + "</ul>";
  }).join("");

  root.innerHTML = head + body;
  // Чтобы результат можно было прочитать снаружи, не разбирая разметку.
  document.title = (failed.length ? "✗ " : "✓ ") + "Тесты — Ремонт комнаты";
  window.__testResults = { total: results.length, failed: failed.length, failures: failed };
}

function escape(text) {
  return String(text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}
