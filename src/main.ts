import "./style.css";
import {
  type Budget,
  type Category,
  type Expense,
  type Frequency,
  type ParsedReceipt,
  type Recurring,
  type Settings,
} from "./types";
import { categoryColor, allCategories } from "./classify";
import { icon, categoryIcon } from "./icons";
import { runOcr } from "./ocr";
import { parseReceipt } from "./parser";
import {
  addExpense,
  deleteExpense,
  loadBudget,
  loadCustomCategories,
  loadExpenses,
  loadRecurring,
  loadSettings,
  newId,
  saveBudget,
  saveCustomCategories,
  saveExpenses,
  saveRecurring,
  saveSettings,
} from "./store";
import { exportToXlsx } from "./exportXlsx";
import { donut, type DonutSegment } from "./donut";
import {
  connect as driveConnect,
  consumePlanFromHash,
  createPlan,
  disconnect as driveDisconnect,
  driveConfigured,
  getSheetId,
  inviteUrl,
  isConnected as driveConnected,
  setSheetId,
  shareAnyoneWithLink,
  shareWith as driveShare,
  sheetUrl,
  syncExpenses,
} from "./drive";
import {
  checkAndNotify,
  daysUntil,
  nextChargeDate,
  notificationPermission,
  notificationsSupported,
  requestNotificationPermission,
  whenLabel,
} from "./notify";

type Tab = "capturar" | "gastos" | "estrategia" | "historial" | "info";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface State {
  tab: Tab;
  expenses: Expense[];
  review: ParsedReceipt | null;
  busy: boolean;
  progress: number;
  progressText: string;
  error: string | null;
  histYear: number | null;
  budget: Budget;
  recurring: Recurring[];
  settings: Settings;
}

const state: State = {
  tab: "capturar",
  expenses: loadExpenses(),
  review: null,
  busy: false,
  progress: 0,
  progressText: "",
  error: null,
  histYear: null,
  budget: loadBudget(),
  recurring: loadRecurring(),
  settings: loadSettings(),
};

const app = document.getElementById("app")!;

// ---------- instalación PWA ----------
let deferredInstallPrompt: any = null;
let backupMsg = ""; // mensaje de copia que sobrevive al re-render

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}
function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (state.tab === "capturar") render();
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  render();
});

// ---------- helpers DOM ----------
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("data-") || k.startsWith("aria-") || k === "role" || k === "inputmode")
      node.setAttribute(k, v);
    else (node as any)[k] = v;
  }
  for (const c of children) node.append(c);
  return node;
}

function money(n: number, currency = "EUR"): string {
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

// Animación count-up para el total.
function countUp(node: HTMLElement, to: number, currency: string) {
  const dur = 700;
  const start = performance.now();
  function step(now: number) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = money(to * eased, currency);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function ymPrefix(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function expensesInMonth(prefix: string): Expense[] {
  return state.expenses.filter((e) => e.date.startsWith(prefix));
}

// Gasto agregado por categoría → segmentos para el donut (orden por valor desc).
function catSegments(list: Expense[]): DonutSegment[] {
  const by = new Map<Category, number>();
  for (const e of list) by.set(e.category, (by.get(e.category) ?? 0) + e.total);
  return [...by.entries()].map(([c, v]) => ({ label: c, value: v, color: categoryColor(c) }));
}

// Barra de progreso de un tope de gasto, con estados ok / cerca / pasado.
function capBar(label: string, spent: number, cap: number, currency: string): HTMLElement {
  const ratio = cap > 0 ? spent / cap : 0;
  const over = spent > cap;
  const near = !over && ratio >= 0.8;
  const stateClass = over ? "over" : near ? "near" : "ok";

  const row = el("div", { class: `cap-row ${stateClass}` });
  row.append(
    el("div", { class: "cap-head" }, [
      el("span", { class: "cap-label" }, [label]),
      el("span", { class: "cap-nums" }, [`${money(spent, currency)} / ${money(cap, currency)}`]),
    ])
  );
  const bar = el("div", { class: "cap-bar" });
  bar.append(el("div", { class: "cap-fill", style: `width:${Math.min(100, ratio * 100)}%` }));
  row.append(bar);

  if (over) {
    row.append(el("div", { class: "cap-note over" }, [
      icon("alert", 15),
      el("span", {}, [`Te has pasado ${money(spent - cap, currency)}`]),
    ]));
  } else {
    row.append(el("div", { class: "cap-note" }, [`Te quedan ${money(cap - spent, currency)}`]));
  }
  return row;
}

// Interruptor accesible (role=switch).
function switchToggle(checked: boolean, label: string, onChange: (v: boolean) => void): HTMLElement {
  const btn = el("button", {
    class: "switch" + (checked ? " on" : ""),
    role: "switch",
    "aria-checked": checked ? "true" : "false",
    "aria-label": label,
  });
  btn.append(el("span", { class: "switch-knob" }));
  btn.addEventListener("click", () => onChange(!checked));
  return btn;
}

// ---------- OCR flow ----------
async function handleFile(file: File) {
  state.busy = true;
  state.error = null;
  state.progress = 0;
  state.progressText = "Preparando OCR…";
  render();
  try {
    const text = await runOcr(file, (pct, status) => {
      state.progress = pct;
      state.progressText = status;
      render();
    });
    state.review = parseReceipt(text);
  } catch (err) {
    console.error(err);
    state.review = null;
    state.error = "No se pudo procesar la imagen. Prueba con otra foto más nítida.";
  } finally {
    state.busy = false;
    render();
  }
}

function saveReview(r: ParsedReceipt, form: {
  merchant: string; total: number; currency: string; date: string; category: Category; note: string;
}) {
  const e: Expense = {
    id: newId(),
    date: form.date || new Date().toISOString().slice(0, 10),
    merchant: form.merchant || "Comercio",
    total: form.total,
    currency: form.currency || "EUR",
    category: form.category,
    note: form.note,
    rawText: r.rawText,
    createdAt: Date.now(),
  };
  state.expenses = addExpense(e);
  state.review = null;
  state.tab = "gastos";
  render();
}

// Banner de instalación: solo en navegador (no cuando ya está instalada).
function installCard(): HTMLElement | null {
  if (isStandalone()) return null;
  const card = el("div", { class: "install-card" });
  card.append(
    el("div", { class: "install-ico" }, [icon("download", 22)]),
    el("div", { class: "install-txt" }, [
      el("strong", {}, ["Instala MyExpenses"]),
      el("span", { class: "muted small" }, ["Añádela a tu móvil para abrirla como app, tener siempre la última versión y (próximamente) sincronizar con Google Drive."]),
    ])
  );
  if (deferredInstallPrompt) {
    const b = el("button", { class: "btn btn-primary" }, ["Instalar"]);
    b.addEventListener("click", async () => {
      deferredInstallPrompt.prompt();
      try { await deferredInstallPrompt.userChoice; } catch {}
      deferredInstallPrompt = null;
      render();
    });
    card.append(b);
  } else {
    const b = el("button", { class: "btn btn-ghost" }, ["Cómo instalar"]);
    const help = el("p", { class: "muted small install-help" }, [
      isIOS()
        ? "En Safari: toca Compartir (⬆️) y luego «Añadir a pantalla de inicio»."
        : "En el menú del navegador (⋮) elige «Instalar app» o «Añadir a pantalla de inicio».",
    ]);
    help.style.display = "none";
    b.addEventListener("click", () => {
      help.style.display = help.style.display === "none" ? "block" : "none";
    });
    card.append(b, help);
  }
  return card;
}

// ---------- views ----------
function viewCapturar(): HTMLElement {
  const wrap = el("section", { class: "view" });

  if (state.busy) {
    const scanner = el("div", { class: "scanner" }, [
      el("div", { class: "ln" }),
      el("div", { class: "ln" }),
      el("div", { class: "ln" }),
      el("div", { class: "ln" }),
      el("div", { class: "beam" }),
    ]);
    const bar = el("div", { class: "progress" });
    bar.append(el("div", { class: "progress-fill", style: `width:${state.progress}%` }));
    wrap.append(
      el("div", { class: "ocr-busy" }, [
        scanner,
        el("div", { class: "ocr-info", role: "status", "aria-live": "polite" }, [
          el("p", { class: "muted" }, [state.progressText]),
          bar,
        ]),
      ])
    );
    return wrap;
  }

  if (state.review) {
    wrap.append(reviewForm(state.review));
    return wrap;
  }

  const inst = installCard();
  if (inst) wrap.append(inst);

  // ----- resumen del mes actual -----
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const ymPrefix = `${y}-${String(m + 1).padStart(2, "0")}`;
  const monthExp = state.expenses.filter((e) => e.date.startsWith(ymPrefix));
  const monthTotal = monthExp.reduce((s, e) => s + e.total, 0);
  const cur = monthExp[0]?.currency ?? state.expenses[0]?.currency ?? "EUR";

  const amt = el("div", { class: "amt" }, [money(0, cur)]);
  wrap.append(
    el("div", { class: "balance" }, [
      el("div", { class: "lbl" }, [`Gastado en ${MONTHS[m]} ${y}`]),
      amt,
      el("div", { class: "sub" }, [`${monthExp.length} ${monthExp.length === 1 ? "compra" : "compras"} este mes`]),
    ])
  );
  countUp(amt, monthTotal, cur);

  // ----- reparto del mes (donut, siempre visible) + tope global -----
  const chartCard = el("div", { class: "card chart-card" }, [
    el("div", { class: "section-title" }, ["Reparto del mes"]),
    donut(catSegments(monthExp), {
      size: 176, thickness: 20,
      centerLabel: money(monthTotal, cur),
      centerSub: monthExp.length ? MONTHS[m] : "sin gastos",
      fmt: (v) => money(v, cur),
    }),
  ]);
  if (!monthExp.length) {
    chartCard.append(
      el("p", { class: "muted small donut-empty-hint" }, ["Captura tu primer ticket y verás aquí el reparto por categorías."])
    );
  }
  wrap.append(chartCard);
  if (state.budget.monthlyCap && state.budget.monthlyCap > 0) {
    wrap.append(
      el("div", { class: "card" }, [
        el("div", { class: "section-title" }, ["Tope mensual"]),
        capBar("Gasto total del mes", monthTotal, state.budget.monthlyCap, cur),
      ])
    );
  }

  if (state.error) {
    wrap.append(
      el("div", { class: "alert", role: "alert" }, [
        icon("info", 18),
        el("span", {}, [state.error]),
      ])
    );
  }

  // ----- captura (acceso rápido) -----
  const camInput = el("input", { type: "file", accept: "image/*", class: "hidden" });
  camInput.setAttribute("capture", "environment");
  camInput.addEventListener("change", () => {
    const f = camInput.files?.[0];
    if (f) handleFile(f);
  });
  const upInput = el("input", { type: "file", accept: "image/*", class: "hidden" });
  upInput.addEventListener("change", () => {
    const f = upInput.files?.[0];
    if (f) handleFile(f);
  });

  const btnCam = el("button", { class: "btn btn-primary big" }, [
    el("span", { class: "b-ico" }, [icon("camera", 20)]),
    "Hacer foto",
  ]);
  btnCam.addEventListener("click", () => camInput.click());

  const btnUp = el("button", { class: "btn btn-ghost big" }, [
    el("span", { class: "b-ico" }, [icon("upload", 20)]),
    "Subir imagen",
  ]);
  btnUp.addEventListener("click", () => upInput.click());

  wrap.append(el("div", { class: "actions-col" }, [btnCam, btnUp, camInput, upInput]));

  // ----- últimas compras -----
  const recent = [...state.expenses]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    .slice(0, 5);

  if (recent.length === 0) {
    wrap.append(
      el("p", { class: "muted small recent-hint" }, ["Tus últimas compras aparecerán aquí."])
    );
    return wrap;
  }

  const seeAll = el("button", { class: "link-btn" }, ["Ver todo"]);
  seeAll.addEventListener("click", () => {
    state.tab = "historial";
    render();
  });
  wrap.append(
    el("div", { class: "section-row" }, [
      el("div", { class: "section-title" }, ["Últimas compras"]),
      seeAll,
    ])
  );

  const items = el("div", { class: "list" });
  recent.forEach((e, i) => items.append(expenseRow(e, i)));
  wrap.append(items);
  return wrap;
}

function reviewForm(r: ParsedReceipt): HTMLElement {
  const card = el("div", { class: "card review" });
  card.append(el("h3", {}, ["Revisar y confirmar"]));

  const merchant = el("input", { class: "field", value: r.merchant, placeholder: "Comercio", autofocus: "true" });
  const total = el("input", { class: "field", type: "number", step: "0.01", inputmode: "decimal", value: r.total != null ? String(r.total) : "", placeholder: "0,00" });
  const currency = el("input", { class: "field", value: r.currency, placeholder: "EUR" });
  const date = el("input", { class: "field", type: "date", value: r.date ?? new Date().toISOString().slice(0, 10) });
  const note = el("input", { class: "field", value: "", placeholder: "Nota (opcional)" });

  const cat = el("select", { class: "field" });
  for (const c of allCategories()) {
    const o = el("option", { value: c }, [c]);
    if (c === r.category) o.selected = true;
    cat.append(o);
  }

  const totalErr = el("span", { class: "field-error", role: "alert" }, [""]);
  totalErr.style.display = "none";

  card.append(
    labeled("Comercio", merchant),
    labeled("Importe", total, true, totalErr),
    labeled("Moneda", currency),
    labeled("Fecha", date),
    labeled("Categoría", cat),
    labeled("Nota", note)
  );

  const detail = el("details", { class: "raw" });
  detail.append(el("summary", {}, ["Ver texto detectado"]), el("pre", {}, [r.rawText || "(vacío)"]));
  card.append(detail);

  const save = el("button", { class: "btn btn-primary" }, ["Guardar gasto"]);
  save.addEventListener("click", () => {
    const t = parseFloat(total.value);
    if (!Number.isFinite(t) || t <= 0) {
      totalErr.textContent = "Indica un importe válido mayor que 0.";
      totalErr.style.display = "block";
      total.classList.add("invalid");
      total.focus();
      return;
    }
    saveReview(r, {
      merchant: merchant.value.trim(),
      total: t,
      currency: currency.value.trim().toUpperCase() || "EUR",
      date: date.value,
      category: cat.value as Category,
      note: note.value.trim(),
    });
  });

  const cancel = el("button", { class: "btn btn-ghost" }, ["Cancelar"]);
  cancel.addEventListener("click", () => {
    state.review = null;
    render();
  });

  card.append(el("div", { class: "actions-row" }, [cancel, save]));
  return card;
}

function labeled(label: string, input: HTMLElement, required = false, extra?: HTMLElement): HTMLElement {
  const lbl = el("span", { class: "label" }, [label]);
  if (required) lbl.append(el("span", { class: "req", "aria-hidden": "true" }, [" *"]));
  const node = el("label", { class: "labeled" }, [lbl, input]);
  if (extra) node.append(extra);
  return node;
}

function viewGastos(): HTMLElement {
  const wrap = el("section", { class: "view" });
  const list = state.expenses;

  if (list.length === 0) {
    wrap.append(
      el("div", { class: "empty" }, [
        el("div", { class: "empty-icon" }, [icon("receipt", 44)]),
        el("p", { class: "muted" }, ["Aún no hay gastos. Captura tu primer ticket."]),
      ])
    );
    return wrap;
  }

  const cur = list[0].currency;
  const totalGastado = list.reduce((s, e) => s + e.total, 0);
  const byCat = new Map<Category, number>();
  for (const e of list) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.total);

  // tarjeta de balance con count-up
  const amt = el("div", { class: "amt" }, [money(0, cur)]);
  wrap.append(
    el("div", { class: "balance" }, [
      el("div", { class: "lbl" }, ["Total gastado"]),
      amt,
      el("div", { class: "sub" }, [`${list.length} ${list.length === 1 ? "gasto" : "gastos"} registrados`]),
    ])
  );
  countUp(amt, totalGastado, cur);

  // chips por categoría con punto de color
  const chips = el("div", { class: "chips" });
  [...byCat.entries()].sort((a, b) => b[1] - a[1]).forEach(([c, v]) => {
    chips.append(
      el("span", { class: "chip" }, [
        el("span", { class: "dot", style: `color:${categoryColor(c)};background:${categoryColor(c)}` }),
        `${c} · ${money(v, cur)}`,
      ])
    );
  });
  wrap.append(chips);

  const exportBtn = el("button", { class: "btn btn-primary" }, [
    el("span", { class: "b-ico" }, [icon("download", 18)]),
    "Exportar a Excel",
  ]);
  exportBtn.addEventListener("click", () => {
    exportBtn.textContent = "Generando…";
    exportToXlsx(list).finally(() => render());
  });
  wrap.append(el("div", { class: "actions-row end" }, [exportBtn]));

  wrap.append(el("div", { class: "section-title" }, ["Movimientos"]));

  const items = el("div", { class: "list" });
  list.forEach((e, i) => items.append(expenseRow(e, i)));
  wrap.append(items);
  return wrap;
}

// Tarjeta de gasto reutilizable (Gastos e Historial).
function expenseRow(e: Expense, i: number): HTMLElement {
  const color = categoryColor(e.category);
  const row = el("div", { class: "expense", style: `--cat:${color};animation-delay:${i * 0.04}s` }, [
    el("div", { class: "exp-ico" }, [icon(categoryIcon(e.category), 20)]),
    el("div", { class: "expense-main" }, [
      el("div", { class: "expense-merchant" }, [e.merchant]),
      el("div", { class: "expense-meta" }, [`${e.date} · ${e.category}`]),
    ]),
    el("div", { class: "expense-amount" }, [money(e.total, e.currency)]),
  ]);
  const del = el("button", { class: "icon-btn", title: "Eliminar", "aria-label": `Eliminar gasto de ${e.merchant}` }, [icon("trash", 18)]);
  del.addEventListener("click", () => {
    state.expenses = deleteExpense(e.id);
    render();
  });
  row.append(del);
  return row;
}

function viewHistorial(): HTMLElement {
  const wrap = el("section", { class: "view" });
  const all = state.expenses;

  if (all.length === 0) {
    wrap.append(
      el("div", { class: "empty" }, [
        el("div", { class: "empty-icon" }, [icon("calendar", 44)]),
        el("p", { class: "muted" }, ["Sin historial todavía. Captura tu primer ticket."]),
      ])
    );
    return wrap;
  }

  wrap.append(el("div", { class: "hero" }, [el("h2", {}, ["Historial"])]));

  // años disponibles (desc)
  const years = [...new Set(all.map((e) => +e.date.slice(0, 4)).filter((y) => y > 0))].sort((a, b) => b - a);
  let year = state.histYear ?? years[0];
  if (!years.includes(year)) year = years[0];

  // filtro de año
  const filter = el("div", { class: "year-filter", role: "group", "aria-label": "Filtrar por año" });
  for (const y of years) {
    const chip = el("button", { class: "year-chip" + (y === year ? " active" : "") }, [String(y)]);
    if (y === year) chip.setAttribute("aria-current", "true");
    chip.addEventListener("click", () => {
      state.histYear = y;
      render();
    });
    filter.append(chip);
  }
  wrap.append(filter);

  // gastos del año, agrupados por mes
  const ofYear = all.filter((e) => +e.date.slice(0, 4) === year);
  const cur = ofYear[0]?.currency ?? "EUR";
  const byMonth = new Map<number, Expense[]>();
  for (const e of ofYear) {
    const m = +e.date.slice(5, 7) - 1;
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(e);
  }

  const yearTotal = ofYear.reduce((s, e) => s + e.total, 0);
  wrap.append(
    el("div", { class: "year-summary" }, [
      el("span", { class: "muted" }, [`${ofYear.length} ${ofYear.length === 1 ? "gasto" : "gastos"} en ${year}`]),
      el("strong", {}, [money(yearTotal, cur)]),
    ])
  );

  if (ofYear.length) {
    wrap.append(
      el("div", { class: "card chart-card" }, [
        el("div", { class: "section-title" }, [`Reparto de ${year}`]),
        donut(catSegments(ofYear), {
          size: 200, thickness: 24,
          centerLabel: money(yearTotal, cur), centerSub: String(year),
          fmt: (v) => money(v, cur),
        }),
      ])
    );
  }

  let idx = 0;
  [...byMonth.keys()].sort((a, b) => b - a).forEach((m) => {
    const monthExp = byMonth.get(m)!.sort((a, b) => b.date.localeCompare(a.date));
    const monthTotal = monthExp.reduce((s, e) => s + e.total, 0);
    wrap.append(
      el("div", { class: "month-header" }, [
        el("span", { class: "month-name" }, [MONTHS[m]]),
        el("span", { class: "month-total" }, [money(monthTotal, cur)]),
      ])
    );
    const items = el("div", { class: "list" });
    monthExp.forEach((e) => items.append(expenseRow(e, idx++)));
    wrap.append(items);
  });

  return wrap;
}

// ---------- estrategia ----------
function runNotifyCheck(): void {
  try {
    checkAndNotify(state.recurring, state.settings, money);
  } catch {
    /* noop */
  }
}

function viewEstrategia(): HTMLElement {
  const wrap = el("section", { class: "view" });
  wrap.append(el("div", { class: "hero" }, [el("h2", {}, ["Estrategia"])]));

  const prefix = ymPrefix();
  const monthExp = expensesInMonth(prefix);
  const cur = state.budget.currency || monthExp[0]?.currency || state.expenses[0]?.currency || "EUR";
  const monthTotal = monthExp.reduce((s, e) => s + e.total, 0);
  const now = new Date();

  // donut del mes (siempre visible)
  const chartCard = el("div", { class: "card chart-card" });
  chartCard.append(el("h3", {}, [`Gasto de ${MONTHS[now.getMonth()]}`]));
  chartCard.append(
    donut(catSegments(monthExp), {
      size: 200, thickness: 24,
      centerLabel: money(monthTotal, cur),
      centerSub: monthExp.length ? "este mes" : "sin gastos",
      fmt: (v) => money(v, cur),
    })
  );
  if (!monthExp.length) {
    chartCard.append(el("p", { class: "muted small donut-empty-hint" }, ["Sin gastos este mes todavía. Captura un ticket para ver el reparto."]));
  }
  wrap.append(chartCard);

  wrap.append(capsCard(monthExp, monthTotal, cur));
  wrap.append(recurringCard(cur));
  wrap.append(categoriesCard());
  wrap.append(backupCard());
  wrap.append(planCard());
  wrap.append(notificationsCard());
  return wrap;
}

function capsCard(monthExp: Expense[], monthTotal: number, cur: string): HTMLElement {
  const card = el("div", { class: "card" });
  card.append(el("h3", {}, ["Topes de gasto"]));
  card.append(el("p", { class: "muted small" }, ["Marca un máximo de gasto. Te avisamos al acercarte o pasarte."]));

  // tope global mensual
  const globalInput = el("input", {
    class: "field", type: "number", inputmode: "decimal", step: "1", min: "0",
    placeholder: "Sin tope", value: state.budget.monthlyCap != null ? String(state.budget.monthlyCap) : "",
  });
  globalInput.addEventListener("change", () => {
    const v = parseFloat(globalInput.value);
    state.budget.monthlyCap = Number.isFinite(v) && v > 0 ? v : null;
    saveBudget(state.budget);
    render();
  });
  card.append(labeled("Tope mensual total", globalInput));
  if (state.budget.monthlyCap && state.budget.monthlyCap > 0) {
    card.append(capBar("Gasto total del mes", monthTotal, state.budget.monthlyCap, cur));
  }

  // topes por categoría existentes
  const monthByCat = new Map<Category, number>();
  for (const e of monthExp) monthByCat.set(e.category, (monthByCat.get(e.category) ?? 0) + e.total);
  const capEntries = Object.entries(state.budget.categoryCaps) as [Category, number][];
  if (capEntries.length) {
    card.append(el("div", { class: "section-title" }, ["Topes por categoría"]));
    capEntries.sort((a, b) => b[1] - a[1]).forEach(([c, cap]) => {
      const block = el("div", { class: "cap-block" }, [capBar(c, monthByCat.get(c) ?? 0, cap, cur)]);
      const rm = el("button", { class: "link-btn danger", "aria-label": `Quitar tope de ${c}` }, ["Quitar"]);
      rm.addEventListener("click", () => {
        delete state.budget.categoryCaps[c];
        saveBudget(state.budget);
        render();
      });
      block.append(rm);
      card.append(block);
    });
  }

  // añadir tope de categoría
  const catSel = el("select", { class: "field" });
  for (const c of allCategories()) {
    const o = el("option", { value: c }, [c]);
    if (c === "Comida a domicilio") o.selected = true;
    catSel.append(o);
  }
  const amtInput = el("input", { class: "field", type: "number", inputmode: "decimal", step: "1", min: "0", placeholder: "Importe €" });
  amtInput.addEventListener("input", () => amtInput.classList.remove("invalid"));
  const addBtn = el("button", { class: "btn btn-ghost" }, [el("span", { class: "b-ico" }, [icon("plus", 18)]), "Guardar tope"]);
  addBtn.addEventListener("click", () => {
    const v = parseFloat(amtInput.value);
    if (!Number.isFinite(v) || v <= 0) { amtInput.classList.add("invalid"); amtInput.focus(); return; }
    state.budget.categoryCaps[catSel.value as Category] = v;
    saveBudget(state.budget);
    render();
  });
  card.append(
    el("div", { class: "section-title" }, ["Añadir tope por categoría"]),
    el("div", { class: "cap-add" }, [labeled("Categoría", catSel), labeled("Tope mensual", amtInput)]),
    el("div", { class: "actions-row end" }, [addBtn])
  );
  return card;
}

function recurringRow(r: Recurring, i: number): HTMLElement {
  const color = categoryColor(r.category);
  const due = nextChargeDate(r);
  const d = daysUntil(due);
  const soon = d <= state.settings.notifyDaysBefore;
  const dueStr = due.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const freqLabel = r.frequency === "monthly" ? "mensual" : "anual";

  const row = el("div", { class: "expense rec" + (r.active ? "" : " off"), style: `--cat:${color};animation-delay:${i * 0.04}s` }, [
    el("div", { class: "exp-ico" }, [icon(categoryIcon(r.category), 20)]),
    el("div", { class: "expense-main" }, [
      el("div", { class: "expense-merchant" }, [r.name]),
      el("div", { class: "expense-meta" }, [
        el("span", { class: "rec-next" + (soon && r.active ? " soon" : "") }, [
          r.active ? `${capFirst(whenLabel(d))} · ${dueStr}` : "Pausado",
        ]),
        ` · ${freqLabel}`,
      ]),
    ]),
    el("div", { class: "expense-amount" }, [money(r.amount, r.currency)]),
  ]);

  const actions = el("div", { class: "rec-actions" });
  actions.append(
    switchToggle(r.active, `Avisos de ${r.name}`, (v) => {
      r.active = v;
      saveRecurring(state.recurring);
      render();
    })
  );
  const reg = el("button", { class: "icon-btn neutral", title: "Registrar el cobro como gasto de hoy", "aria-label": `Registrar ${r.name} como gasto` }, [icon("check", 18)]);
  reg.addEventListener("click", () => {
    state.expenses = addExpense({
      id: newId(), date: new Date().toISOString().slice(0, 10),
      merchant: r.name, total: r.amount, currency: r.currency,
      category: r.category, note: "Gasto fijo", rawText: "", createdAt: Date.now(),
    });
    render();
  });
  actions.append(reg);
  const del = el("button", { class: "icon-btn", title: "Eliminar", "aria-label": `Eliminar gasto fijo ${r.name}` }, [icon("trash", 18)]);
  del.addEventListener("click", () => {
    state.recurring = state.recurring.filter((x) => x.id !== r.id);
    saveRecurring(state.recurring);
    render();
  });
  actions.append(del);
  row.append(actions);
  return row;
}

function recurringCard(cur: string): HTMLElement {
  const card = el("div", { class: "card" });
  card.append(el("h3", {}, ["Gastos fijos"]));
  card.append(el("p", { class: "muted small" }, ["Suscripciones y cobros que se repiten (Netflix, Amazon, alquiler…)."]));

  if (state.recurring.length) {
    const list = el("div", { class: "list" });
    state.recurring.forEach((r, i) => list.append(recurringRow(r, i)));
    card.append(list);
  } else {
    card.append(el("p", { class: "muted small recent-hint" }, ["Aún no has programado gastos fijos."]));
  }

  // formulario
  const name = el("input", { class: "field", placeholder: "Nombre (p.ej. Netflix)" });
  name.addEventListener("input", () => name.classList.remove("invalid"));
  const amount = el("input", { class: "field", type: "number", inputmode: "decimal", step: "0.01", min: "0", placeholder: "Importe €" });
  amount.addEventListener("input", () => amount.classList.remove("invalid"));
  const catSel = el("select", { class: "field" });
  for (const c of allCategories()) {
    const o = el("option", { value: c }, [c]);
    if (c === "Ocio") o.selected = true;
    catSel.append(o);
  }
  const freq = el("select", { class: "field" });
  freq.append(el("option", { value: "monthly" }, ["Cada mes"]), el("option", { value: "yearly" }, ["Cada año"]));
  const day = el("input", { class: "field", type: "number", inputmode: "numeric", min: "1", max: "31", value: "1" });
  const monthSel = el("select", { class: "field" });
  MONTHS.forEach((mn, idx) => monthSel.append(el("option", { value: String(idx) }, [mn])));
  const monthField = labeled("Mes del cobro (anual)", monthSel);
  monthField.classList.add("hidden");
  freq.addEventListener("change", () => monthField.classList.toggle("hidden", freq.value !== "yearly"));

  const add = el("button", { class: "btn btn-primary" }, [el("span", { class: "b-ico" }, [icon("plus", 18)]), "Añadir gasto fijo"]);
  add.addEventListener("click", () => {
    const a = parseFloat(amount.value);
    if (!name.value.trim()) { name.classList.add("invalid"); name.focus(); return; }
    if (!Number.isFinite(a) || a <= 0) { amount.classList.add("invalid"); amount.focus(); return; }
    const dom = Math.min(31, Math.max(1, parseInt(day.value || "1", 10)));
    const r: Recurring = {
      id: newId(), name: name.value.trim(), amount: a, currency: cur,
      category: catSel.value as Category, frequency: freq.value as Frequency,
      dayOfMonth: dom, month: freq.value === "yearly" ? parseInt(monthSel.value, 10) : undefined,
      active: true, createdAt: Date.now(),
    };
    state.recurring = [r, ...state.recurring];
    saveRecurring(state.recurring);
    runNotifyCheck();
    render();
  });

  card.append(
    el("div", { class: "section-title" }, ["Programar nuevo"]),
    el("div", { class: "rec-form" }, [
      labeled("Nombre", name), labeled("Importe", amount),
      labeled("Categoría", catSel), labeled("Frecuencia", freq),
      labeled("Día del mes", day), monthField,
    ]),
    el("div", { class: "actions-row end" }, [add])
  );
  return card;
}

function categoriesCard(): HTMLElement {
  const card = el("div", { class: "card" });
  card.append(el("h3", {}, ["Mis categorías"]));
  card.append(el("p", { class: "muted small" }, ["Crea categorías propias para clasificar tus gastos a tu manera."]));

  const customs = loadCustomCategories();
  if (customs.length) {
    const list = el("div", { class: "cat-list" });
    customs.forEach((c) => {
      const rowEl = el("div", { class: "cat-row" }, [
        el("span", { class: "cat-swatch", style: `background:${c.color}` }),
        el("span", { class: "cat-name" }, [c.name]),
      ]);
      const rm = el("button", { class: "link-btn danger", "aria-label": `Eliminar categoría ${c.name}` }, ["Eliminar"]);
      rm.addEventListener("click", () => {
        saveCustomCategories(loadCustomCategories().filter((x) => x.name !== c.name));
        render();
      });
      rowEl.append(rm);
      list.append(rowEl);
    });
    card.append(list);
  } else {
    card.append(el("p", { class: "muted small recent-hint" }, ["Aún no has creado categorías propias."]));
  }

  // alta de categoría
  const name = el("input", { class: "field", placeholder: "Nombre (p.ej. Mascota)" });
  name.addEventListener("input", () => name.classList.remove("invalid"));
  const color = el("input", { class: "field color", type: "color", value: "#7dd3fc" });
  const err = el("span", { class: "field-error", role: "alert" }, [""]);
  err.style.display = "none";

  const add = el("button", { class: "btn btn-ghost" }, [el("span", { class: "b-ico" }, [icon("plus", 18)]), "Añadir categoría"]);
  add.addEventListener("click", () => {
    const nm = name.value.trim();
    if (!nm) {
      err.textContent = "Escribe un nombre."; err.style.display = "block";
      name.classList.add("invalid"); name.focus(); return;
    }
    if (allCategories().some((c) => c.toLowerCase() === nm.toLowerCase())) {
      err.textContent = "Ya existe una categoría con ese nombre."; err.style.display = "block";
      name.classList.add("invalid"); name.focus(); return;
    }
    const list = loadCustomCategories();
    list.push({ name: nm, color: color.value, icon: "tag" });
    saveCustomCategories(list);
    render();
  });

  card.append(
    el("div", { class: "cat-add" }, [labeled("Nombre", name), labeled("Color", color)]),
    err,
    el("div", { class: "actions-row end" }, [add])
  );
  return card;
}

// ---------- copia de seguridad sin conexión (JSON) ----------
function backupBundle() {
  return {
    app: "MyExpenses",
    version: 1,
    exportedAt: new Date().toISOString(),
    expenses: state.expenses,
    customCategories: loadCustomCategories(),
    recurring: state.recurring,
  };
}

function backupFile(): File {
  const stamp = new Date().toISOString().slice(0, 10);
  return new File([JSON.stringify(backupBundle(), null, 2)], `MyExpenses_${stamp}.json`, {
    type: "application/json",
  });
}

function downloadBackup(): void {
  const file = backupFile();
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Importa y FUSIONA (no sobrescribe): gastos por id, categorías por nombre, fijos por id.
function importBackup(data: any): { exp: number; cat: number; rec: number } {
  let exp = 0, cat = 0, rec = 0;
  if (data && Array.isArray(data.expenses)) {
    const have = new Set(state.expenses.map((e) => e.id));
    const add = data.expenses.filter((e: any) => e && e.id && !have.has(e.id));
    if (add.length) {
      state.expenses = [...add, ...state.expenses].sort((a, b) => b.date.localeCompare(a.date));
      saveExpenses(state.expenses);
      exp = add.length;
    }
  }
  if (data && Array.isArray(data.customCategories)) {
    const cur = loadCustomCategories();
    const names = new Set(cur.map((c) => c.name.toLowerCase()));
    const add = data.customCategories.filter((c: any) => c && c.name && !names.has(String(c.name).toLowerCase()));
    if (add.length) {
      saveCustomCategories([...cur, ...add]);
      cat = add.length;
    }
  }
  if (data && Array.isArray(data.recurring)) {
    const have = new Set(state.recurring.map((r) => r.id));
    const add = data.recurring.filter((r: any) => r && r.id && !have.has(r.id));
    if (add.length) {
      state.recurring = [...state.recurring, ...add];
      saveRecurring(state.recurring);
      rec = add.length;
    }
  }
  return { exp, cat, rec };
}

function backupCard(): HTMLElement {
  const card = el("div", { class: "card" });
  card.append(el("div", { class: "noti-head" }, [el("span", { class: "noti-ico" }, [icon("save", 20)]), el("h3", {}, ["Copia de seguridad"])]));
  card.append(el("p", { class: "muted small" }, ["Sin conexión ni Google: guarda o comparte un archivo con todos tus gastos, e impórtalo en otro móvil (se fusiona, no se borra nada)."]));

  const status = el("p", { class: "muted small" }, [backupMsg]);

  const exportBtn = el("button", { class: "btn btn-primary" }, [el("span", { class: "b-ico" }, [icon("download", 18)]), "Exportar copia"]);
  exportBtn.addEventListener("click", () => {
    downloadBackup();
    status.textContent = "Copia descargada.";
  });

  const shareBtn = el("button", { class: "btn btn-ghost" }, [el("span", { class: "b-ico" }, [icon("share", 18)]), "Compartir copia"]);
  shareBtn.addEventListener("click", async () => {
    const file = backupFile();
    const nav = navigator as any;
    if (nav.canShare && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: "MyExpenses", text: "Copia de mis gastos (MyExpenses)" });
        status.textContent = "Compartido.";
      } catch {
        status.textContent = "Compartir cancelado.";
      }
    } else {
      downloadBackup();
      status.textContent = "Tu navegador no permite compartir archivos; copia descargada para enviarla a mano.";
    }
  });

  const importInput = el("input", { type: "file", accept: "application/json,.json", class: "hidden" });
  importInput.addEventListener("change", async () => {
    const f = importInput.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const r = importBackup(data);
      backupMsg = `Importado: ${r.exp} gastos, ${r.cat} categorías, ${r.rec} fijos.`;
      render();
    } catch {
      status.textContent = "Archivo no válido.";
    }
  });
  const importBtn = el("button", { class: "btn btn-ghost" }, [el("span", { class: "b-ico" }, [icon("upload", 18)]), "Importar copia"]);
  importBtn.addEventListener("click", () => importInput.click());

  card.append(el("div", { class: "actions-col" }, [exportBtn, shareBtn, importBtn, importInput]), status);
  return card;
}

// Mezcla gastos bajados del plan en el estado local (sin duplicar por id).
function mergeExpenses(pulled: Expense[]): number {
  if (!pulled.length) return 0;
  const have = new Set(state.expenses.map((e) => e.id));
  const add = pulled.filter((e) => !have.has(e.id));
  if (add.length) {
    state.expenses = [...add, ...state.expenses].sort((a, b) => b.date.localeCompare(a.date));
    saveExpenses(state.expenses);
  }
  return add.length;
}

function planCard(): HTMLElement {
  const card = el("div", { class: "card" });
  card.append(el("div", { class: "noti-head" }, [el("span", { class: "noti-ico" }, [icon("upload", 20)]), el("h3", {}, ["Plan compartido"])]));

  if (!driveConfigured()) {
    card.append(el("p", { class: "muted small" }, [
      "Plan compartido pendiente de configurar (falta el Client ID de Google en src/drive.ts — ver README).",
    ]));
    return card;
  }

  const status = el("p", { class: "muted small drive-status" }, [""]);
  const hasPlan = !!getSheetId();

  // No conectado
  if (!driveConnected()) {
    card.append(
      el("p", { class: "muted small" }, [
        hasPlan
          ? "Te han invitado a un plan. Conéctate con Google para unirte y sincronizar."
          : "Comparte un único documento con tu pareja o familia: cada uno captura desde su móvil y todo se cuadra en la misma hoja de Google.",
      ])
    );
    const b = el("button", { class: "btn btn-primary" }, [el("span", { class: "b-ico" }, [icon("upload", 18)]), hasPlan ? "Conectar y unirme al plan" : "Conectar Google"]);
    b.addEventListener("click", async () => {
      b.disabled = true;
      status.textContent = "Conectando…";
      try {
        await driveConnect();
        if (getSheetId()) {
          const r = await syncExpenses(state.expenses);
          mergeExpenses(r.pulled);
        }
        render();
      } catch (e: any) {
        status.textContent = "No se pudo conectar: " + (e?.message || e);
        b.disabled = false;
      }
    });
    card.append(b, status);
    return card;
  }

  // Conectado, sin plan → crear
  if (!hasPlan) {
    card.append(el("p", { class: "muted small" }, ["Conectado. Crea el plan compartido para empezar a invitar."]));
    const create = el("button", { class: "btn btn-primary" }, [el("span", { class: "b-ico" }, [icon("plus", 18)]), "Crear plan compartido"]);
    create.addEventListener("click", async () => {
      create.disabled = true;
      status.textContent = "Creando plan…";
      try {
        await createPlan();
        const r = await syncExpenses(state.expenses);
        mergeExpenses(r.pulled);
        render();
      } catch (e: any) {
        status.textContent = "Error al crear: " + (e?.message || e);
        create.disabled = false;
      }
    });
    const dc0 = el("button", { class: "link-btn danger" }, ["Desconectar"]);
    dc0.addEventListener("click", () => { driveDisconnect(); render(); });
    card.append(create, status, el("div", { class: "actions-row end" }, [dc0]));
    return card;
  }

  // Conectado y con plan activo
  card.append(el("p", { class: "muted small" }, ["Plan activo. Tus gastos y los de los miembros se sincronizan en la misma hoja."]));

  const syncBtn = el("button", { class: "btn btn-primary" }, [el("span", { class: "b-ico" }, [icon("repeat", 18)]), "Sincronizar ahora"]);
  syncBtn.addEventListener("click", async () => {
    syncBtn.disabled = true;
    status.textContent = "Sincronizando…";
    try {
      const r = await syncExpenses(state.expenses);
      const pulled = mergeExpenses(r.pulled);
      status.textContent = `Sincronizado: subidos ${r.added}, bajados ${pulled}.`;
      render();
    } catch (e: any) {
      status.textContent = "Error al sincronizar: " + (e?.message || e);
      syncBtn.disabled = false;
    }
  });
  const actions = el("div", { class: "actions-col" }, [syncBtn]);

  const url = sheetUrl();
  if (url) actions.append(el("a", { class: "btn btn-ghost", href: url, target: "_blank", rel: "noopener" }, ["Abrir la hoja del plan"]));
  card.append(actions);

  // Invitar
  card.append(el("div", { class: "section-title" }, ["Invitar al plan"]));

  const waBtn = el("button", { class: "btn btn-ghost" }, ["Compartir por WhatsApp"]);
  waBtn.addEventListener("click", async () => {
    waBtn.disabled = true;
    status.textContent = "Preparando enlace…";
    try {
      await shareAnyoneWithLink("writer");
      const link = inviteUrl();
      const msg = `Únete a nuestro plan de gastos en MyExpenses 👇\n${link}`;
      window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank", "noopener");
      status.textContent = "Enlace listo. ⚠️ No lo publiques: cualquiera con el enlace puede editar.";
    } catch (e: any) {
      status.textContent = "Error: " + (e?.message || e);
    }
    waBtn.disabled = false;
  });

  const email = el("input", { class: "field", type: "email", placeholder: "correo@ejemplo.com" });
  email.addEventListener("input", () => email.classList.remove("invalid"));
  const shareBtn = el("button", { class: "btn btn-ghost" }, ["Invitar por email"]);
  shareBtn.addEventListener("click", async () => {
    const v = email.value.trim();
    if (!v) { email.classList.add("invalid"); email.focus(); return; }
    shareBtn.disabled = true;
    status.textContent = "Invitando…";
    try {
      await driveShare(v, "writer");
      status.textContent = `Invitado ${v}.`;
      email.value = "";
    } catch (e: any) {
      status.textContent = "Error al invitar: " + (e?.message || e);
    }
    shareBtn.disabled = false;
  });

  card.append(
    el("div", { class: "actions-col" }, [waBtn]),
    el("div", { class: "cap-add" }, [labeled("Email", email)]),
    el("div", { class: "actions-row end" }, [shareBtn])
  );

  // Salir / desconectar
  const leave = el("button", { class: "link-btn danger" }, ["Salir del plan"]);
  leave.addEventListener("click", () => { setSheetId(null); render(); });
  const dc = el("button", { class: "link-btn" }, ["Desconectar"]);
  dc.addEventListener("click", () => { driveDisconnect(); render(); });

  card.append(status, el("div", { class: "actions-row end" }, [leave, dc]));
  return card;
}

function notificationsCard(): HTMLElement {
  const card = el("div", { class: "card" });
  card.append(el("div", { class: "noti-head" }, [el("span", { class: "noti-ico" }, [icon("bell", 20)]), el("h3", {}, ["Notificaciones"])]));

  if (!notificationsSupported()) {
    card.append(el("p", { class: "muted small" }, ["Tu navegador no admite notificaciones."]));
    return card;
  }

  const perm = notificationPermission();
  const toggle = switchToggle(state.settings.notificationsEnabled && perm === "granted", "Activar notificaciones", async (v) => {
    if (v) {
      const ok = await requestNotificationPermission();
      state.settings.notificationsEnabled = ok;
      saveSettings(state.settings);
      if (ok) runNotifyCheck();
      render();
    } else {
      state.settings.notificationsEnabled = false;
      saveSettings(state.settings);
      render();
    }
  });
  card.append(
    el("div", { class: "noti-row" }, [
      el("div", { class: "noti-text" }, [
        el("div", { class: "noti-title" }, ["Avisarme de cobros próximos"]),
        el("div", { class: "muted small" }, ["Por ejemplo: «Mañana se cobra Netflix»."]),
      ]),
      toggle,
    ])
  );

  if (perm === "denied") {
    card.append(el("p", { class: "muted small" }, ["Has bloqueado las notificaciones en el navegador. Actívalas desde los ajustes del sitio."]));
  }

  const daysSel = el("select", { class: "field" });
  ([["0", "El mismo día"], ["1", "Un día antes"], ["2", "Dos días antes"], ["3", "Tres días antes"]] as const).forEach(([v, l]) => {
    const o = el("option", { value: v }, [l]);
    if (+v === state.settings.notifyDaysBefore) o.selected = true;
    daysSel.append(o);
  });
  daysSel.addEventListener("change", () => {
    state.settings.notifyDaysBefore = parseInt(daysSel.value, 10);
    saveSettings(state.settings);
    render();
  });
  card.append(labeled("Antelación del aviso", daysSel));
  card.append(el("p", { class: "muted small" }, ["Al ser una web/app sin servidor, los avisos se comprueban cuando abres MyExpenses."]));
  return card;
}

function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function viewInfo(): HTMLElement {
  const wrap = el("section", { class: "view" });
  wrap.append(
    el("div", { class: "card" }, [
      el("h3", {}, ["Información adicional"]),
      el("p", {}, [
        "MyExpenses está creado por ",
        el("a", { href: "https://github.com/MAI-Software", target: "_blank", rel: "noopener" }, ["MAISoftwares"]),
        " en GitHub.",
      ]),
      el("p", { class: "muted small" }, ["Versión 0.1.0 · nombre provisional."]),
    ])
  );

  const cookies = el("details", { class: "card policy" });
  cookies.append(
    el("summary", {}, ["Política de cookies"]),
    el("p", { class: "muted small" }, [
      "MyExpenses no usa cookies de seguimiento ni publicidad. Solo emplea almacenamiento local del navegador (localStorage) para guardar tus gastos en tu propio dispositivo. No se comparte con terceros.",
    ])
  );

  const privacy = el("details", { class: "card policy" });
  privacy.append(
    el("summary", {}, ["Política de privacidad"]),
    el("p", { class: "muted small" }, [
      "Tus imágenes se procesan localmente en tu dispositivo (OCR en el navegador); no se suben a ningún servidor. Los datos de gastos se guardan únicamente en tu navegador y puedes exportarlos o borrarlos cuando quieras. MyExpenses no recopila datos personales.",
    ])
  );

  wrap.append(cookies, privacy);
  return wrap;
}

// ---------- shell ----------
function nav(): HTMLElement {
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "capturar", label: "Capturar", icon: "camera" },
    { id: "gastos", label: "Gastos", icon: "wallet" },
    { id: "estrategia", label: "Estrategia", icon: "target" },
    { id: "historial", label: "Historial", icon: "calendar" },
    { id: "info", label: "Info", icon: "info" },
  ];
  const bar = el("nav", { class: "tabbar", "aria-label": "Navegación principal" });
  for (const t of tabs) {
    const active = state.tab === t.id;
    const b = el("button", { class: "tab" + (active ? " active" : "") }, [
      el("span", { class: "tab-icon" }, [icon(t.icon, 22)]),
      el("span", { class: "tab-label" }, [t.label]),
    ]);
    if (active) b.setAttribute("aria-current", "page");
    b.addEventListener("click", () => {
      state.tab = t.id;
      render();
    });
    bar.append(b);
  }
  return bar;
}

function render() {
  app.innerHTML = "";
  const header = el("header", { class: "topbar" }, [
    el("div", { class: "brand" }, [
      el("span", { class: "brand-mark" }, ["M"]),
      el("span", { class: "brand-name" }, ["MyExpenses"]),
    ]),
  ]);

  const main = el("main", { class: "content" });
  if (state.tab === "capturar") main.append(viewCapturar());
  else if (state.tab === "gastos") main.append(viewGastos());
  else if (state.tab === "estrategia") main.append(viewEstrategia());
  else if (state.tab === "historial") main.append(viewHistorial());
  else main.append(viewInfo());

  app.append(header, main, nav());
}

// aurora de fondo (una sola vez, fuera de #app)
const aurora = document.createElement("div");
aurora.className = "aurora";
const blob = document.createElement("div");
blob.className = "blob";
aurora.append(blob);
document.body.prepend(aurora);

// Si se abre un enlace de invitación (#plan=ID), vincula el plan y abre Estrategia.
// Se marca con timestamp para sobrevivir a la auto-recarga del service worker
// (que limpiaría el hash antes de poder cambiar de pestaña).
const JOIN_KEY = "myexpenses.joinTs";
if (consumePlanFromHash()) sessionStorage.setItem(JOIN_KEY, String(Date.now()));
if (Date.now() - Number(sessionStorage.getItem(JOIN_KEY) || 0) < 15000) {
  state.tab = "estrategia";
}

render();

// Comprobar cobros próximos al arrancar (si el usuario ya dio permiso).
runNotifyCheck();

// Service worker: SOLO en producción. En dev causaría servir assets cacheados
// (versiones viejas). En dev, además, desregistramos cualquier SW previo.
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    // Cuando un SW nuevo toma el control, recarga una vez para mostrar la
    // versión nueva sin que el usuario tenga que refrescar a mano.
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
    window.addEventListener("load", async () => {
      try {
        const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
        // comprueba si hay actualización cada vez que se vuelve a la app
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        });
      } catch {
        /* sin SW, la app sigue funcionando online */
      }
    });
  } else {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
    if ("caches" in window) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)));
  }
}
