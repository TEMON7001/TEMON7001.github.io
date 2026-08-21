// ==== Навигация по вкладкам ====
const tabBtns = document.querySelectorAll(".tab-btn");
const tabs = document.querySelectorAll(".tab");

tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const name = btn.dataset.tab;
    tabBtns.forEach((b) => b.classList.toggle("active", b === btn));
    tabs.forEach((t) => t.classList.toggle("hidden", t.dataset.tab !== name));
  });
});

// ==== Общие утилиты ====
function fmt(n, digits = 1) {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function powerToCurrent(powerKw, voltage, phase, cosphi) {
  const p = powerKw * 1000;
  if (phase === 1) return p / (voltage * cosphi);
  return p / (Math.sqrt(3) * voltage * cosphi);
}

// Ближайшее (наименьшее подходящее) сечение из таблицы допустимых токов
function sectionByAmpacity(table, neededCurrent) {
  const sections = Object.keys(table).map(Number).sort((a, b) => a - b);
  for (const s of sections) {
    if (table[s] >= neededCurrent) return { section: s, ampacity: table[s] };
  }
  return null;
}

// Сечение по допустимой потере напряжения
function sectionByVoltageDrop({ current, length, material, phase, cosphi, allowedDropVolts }) {
  const rho = RESISTIVITY[material];
  const raw =
    phase === 1
      ? (2 * current * rho * length) / allowedDropVolts
      : (Math.sqrt(3) * current * rho * length * cosphi) / allowedDropVolts;
  const series = SECTION_SERIES[material];
  const rounded = series.find((s) => s >= raw) ?? null;
  return { raw, rounded };
}

// ==== Вкладка "Сечение кабеля" ====
const loadModeButtons = document.querySelectorAll('[data-role="load-mode"] .seg-btn');
let loadMode = "current";

loadModeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    loadMode = btn.dataset.value;
    loadModeButtons.forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelector('[data-show="current"]').classList.toggle("hidden", loadMode !== "current");
    document.querySelector('[data-show="power"]').classList.toggle("hidden", loadMode !== "power");
    computeCable();
  });
});

const cIds = ["c-current", "c-power", "c-phase", "c-cosphi", "c-length", "c-material", "c-install", "c-drop"];
cIds.forEach((id) => document.getElementById(id).addEventListener("input", computeCable));
cIds.forEach((id) => document.getElementById(id).addEventListener("change", computeCable));

function computeCable() {
  const out = document.getElementById("c-result");
  const length = parseFloat(document.getElementById("c-length").value);
  const material = document.getElementById("c-material").value;
  const install = document.getElementById("c-install").value;
  const dropPercent = parseFloat(document.getElementById("c-drop").value);

  let current;
  let phase = 1;
  let cosphi = 1;

  if (loadMode === "current") {
    current = parseFloat(document.getElementById("c-current").value);
  } else {
    const power = parseFloat(document.getElementById("c-power").value);
    phase = parseInt(document.getElementById("c-phase").value, 10);
    cosphi = parseFloat(document.getElementById("c-cosphi").value) || 1;
    const voltage = phase === 1 ? 220 : 380;
    current = isFinite(power) ? powerToCurrent(power, voltage, phase, cosphi) : NaN;
  }

  if (!isFinite(current) || current <= 0 || !isFinite(length) || length <= 0) {
    out.innerHTML = `<p class="placeholder">Заполните параметры нагрузки и длину линии</p>`;
    return;
  }

  const voltage = phase === 1 ? 220 : 380;
  const allowedDropVolts = (voltage * dropPercent) / 100;

  const table = AMPACITY[install][material];
  const byHeat = sectionByAmpacity(table, current);
  const byDrop = sectionByVoltageDrop({ current, length, material, phase, cosphi, allowedDropVolts });

  if (!byHeat || byDrop.rounded === null) {
    out.innerHTML = `
      <p class="result-warning">Нет сечения в таблице для такого тока/способа прокладки.</p>
      <p class="result-note">Нужна открытая прокладка, кабель на лотке, или расчёт проектировщика — в трубе для таких токов данные ограничены до 120 мм².</p>`;
    return;
  }

  const finalSection = Math.max(byHeat.section, byDrop.rounded);
  const governedBy = byHeat.section >= byDrop.rounded ? "нагрев (допустимый ток)" : "потеря напряжения";
  const finalAmpacity = table[finalSection] ?? "—";

  out.innerHTML = `
    <div class="result-headline">${fmt(finalSection, 2)} мм²</div>
    <div class="result-row"><span class="k">Расчётный ток</span><span class="v">${fmt(current)} А</span></div>
    <div class="result-row"><span class="k">По нагреву (табл. ПУЭ)</span><span class="v">${fmt(byHeat.section, 2)} мм² (${byHeat.ampacity} А)</span></div>
    <div class="result-row"><span class="k">По потере напряжения</span><span class="v">${fmt(byDrop.rounded, 2)} мм²</span></div>
    <div class="result-row"><span class="k">Допустимый ток итог. сечения</span><span class="v">${finalAmpacity} А</span></div>
    <p class="result-note">Определяющий критерий: ${governedBy}. Материал: ${MATERIAL_LABELS[material]}, прокладка: ${INSTALL_LABELS[install]}.</p>
  `;
}

// ==== Вкладка "Автомат и УЗО" ====
["b-load", "b-cable"].forEach((id) => document.getElementById(id).addEventListener("input", computeBreaker));

function computeBreaker() {
  const out = document.getElementById("b-result");
  const load = parseFloat(document.getElementById("b-load").value);
  const cableAmpacity = parseFloat(document.getElementById("b-cable").value);

  if (!isFinite(load) || load <= 0 || !isFinite(cableAmpacity) || cableAmpacity <= 0) {
    out.innerHTML = `<p class="placeholder">Укажите расчётный ток нагрузки и допустимый ток кабеля</p>`;
    return;
  }

  if (load > cableAmpacity) {
    out.innerHTML = `<p class="result-warning">Расчётный ток нагрузки превышает допустимый ток кабеля — увеличьте сечение кабеля.</p>`;
    return;
  }

  const suitable = BREAKER_SERIES.filter((b) => b >= load && b <= cableAmpacity);
  if (suitable.length === 0) {
    out.innerHTML = `<p class="result-warning">Нет номинала автомата между расчётным током и допустимым током кабеля из стандартного ряда — проверьте исходные данные.</p>`;
    return;
  }

  const breaker = suitable[0]; // наименьший номинал, покрывающий нагрузку и не превышающий ток кабеля
  const rcd = RCD_SERIES.find((r) => r > breaker) ?? RCD_SERIES[RCD_SERIES.length - 1];

  out.innerHTML = `
    <div class="result-headline">Автомат ${breaker} А</div>
    <div class="result-row"><span class="k">Расчётный ток нагрузки</span><span class="v">${fmt(load)} А</span></div>
    <div class="result-row"><span class="k">Допустимый ток кабеля</span><span class="v">${fmt(cableAmpacity)} А</span></div>
    <div class="result-row"><span class="k">Рекомендуемый номинал УЗО</span><span class="v">${rcd} А</span></div>
    <p class="result-note">Номинал автомата выбран между расчётным током нагрузки и допустимым током кабеля (≥ нагрузки, ≤ кабеля).</p>
  `;
}

// ==== Вкладка "Таблицы ПУЭ" ====
const tMaterial = document.getElementById("t-material");
const tInstall = document.getElementById("t-install");
[tMaterial, tInstall].forEach((el) => el.addEventListener("change", renderTable));

function renderTable() {
  const material = tMaterial.value;
  const install = tInstall.value;
  const table = AMPACITY[install][material];
  const sections = Object.keys(table).map(Number).sort((a, b) => a - b);

  let html = `<thead><tr><th>Сечение, мм²</th><th>Допустимый ток, А</th></tr></thead><tbody>`;
  sections.forEach((s) => {
    html += `<tr><td>${s}</td><td>${table[s]}</td></tr>`;
  });
  html += `</tbody>`;
  document.getElementById("t-table").innerHTML = html;
}

// ==== Вкладка "Ток по мощности" ====
["p-power", "p-phase", "p-cosphi"].forEach((id) => document.getElementById(id).addEventListener("input", computePower));

function computePower() {
  const out = document.getElementById("p-result");
  const power = parseFloat(document.getElementById("p-power").value);
  const phase = parseInt(document.getElementById("p-phase").value, 10);
  const cosphi = parseFloat(document.getElementById("p-cosphi").value) || 1;

  if (!isFinite(power) || power <= 0) {
    out.innerHTML = `<p class="placeholder">Укажите мощность</p>`;
    return;
  }

  const voltage = phase === 1 ? 220 : 380;
  const current = powerToCurrent(power, voltage, phase, cosphi);

  out.innerHTML = `
    <div class="result-headline">${fmt(current)} А</div>
    <div class="result-row"><span class="k">Мощность</span><span class="v">${fmt(power)} кВт</span></div>
    <div class="result-row"><span class="k">Сеть</span><span class="v">${phase === 1 ? "220 В, 1 фаза" : "380 В, 3 фазы"}</span></div>
    <div class="result-row"><span class="k">cos φ</span><span class="v">${fmt(cosphi, 2)}</span></div>
  `;
}

// ==== Инициализация ====
renderTable();
computeCable();
computeBreaker();
computePower();

// ==== Service worker (офлайн) ====
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
