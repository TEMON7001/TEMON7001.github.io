// Общая разметка заглушки. Файл временный: по мере готовности экранов (T6–T11)
// каждый ui-модуль перестаёт её вызывать, после последнего — удаляем.
export function stub(root, { title, lead, points, task }) {
  const list = points.map((p) => "<li>" + p + "</li>").join("");
  root.innerHTML =
    '<h2 class="screen-h2">' + title + "</h2>" +
    '<div class="card">' +
      '<p class="lead">' + lead + "</p>" +
      '<ul class="stub-list">' + list + "</ul>" +
    "</div>" +
    '<p class="disclaimer">Экран в разработке, задача ' + task + ".</p>";
}
