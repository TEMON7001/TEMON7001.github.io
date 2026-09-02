// Заглушка экрана, который ещё не сделан.
// Нужна, чтобы таббар был настоящим с первого дня: переходы, история, кнопка «назад»
// проверяются на всех четырёх вкладках, а не на одной.

export function placeholder(title, lines) {
  return function mount(root) {
    root.innerHTML =
      '<h2 class="screen-h2">' + title + "</h2>" +
      '<div class="card"><p class="placeholder">' + lines.join("<br><br>") + "</p></div>";
  };
}
