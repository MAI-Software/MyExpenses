import "./style.css";
import { CATEGORIES, type Category, type Expense, type ParsedReceipt } from "./types";
import { runOcr } from "./ocr";
import { parseReceipt } from "./parser";
import { addExpense, deleteExpense, loadExpenses, newId } from "./store";
import { exportToXlsx } from "./exportXlsx";

type Tab = "capturar" | "gastos" | "info";

interface State {
  tab: Tab;
  expenses: Expense[];
  review: ParsedReceipt | null;
  busy: boolean;
  progress: number;
  progressText: string;
}

const state: State = {
  tab: "capturar",
  expenses: loadExpenses(),
  review: null,
  busy: false,
  progress: 0,
  progressText: "",
};

const app = document.getElementById("app")!;

// ---------- helpers DOM ----------
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("data-")) node.setAttribute(k, v);
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

// ---------- OCR flow ----------
async function handleFile(file: File) {
  state.busy = true;
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
    state.progressText = "Error al leer la imagen.";
    state.review = null;
    alert("No se pudo procesar la imagen. Prueba con otra foto más nítida.");
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

// ---------- views ----------
function viewCapturar(): HTMLElement {
  const wrap = el("section", { class: "view" });

  if (state.busy) {
    wrap.append(
      el("div", { class: "ocr-busy" }, [
        el("div", { class: "spinner" }),
        el("p", { class: "muted" }, [state.progressText]),
        (() => {
          const bar = el("div", { class: "progress" });
          bar.append(el("div", { class: "progress-fill", style: `width:${state.progress}%` }));
          return bar;
        })(),
      ])
    );
    return wrap;
  }

  if (state.review) {
    wrap.append(reviewForm(state.review));
    return wrap;
  }

  wrap.append(
    el("div", { class: "hero" }, [
      el("h2", {}, ["Captura un gasto"]),
      el("p", { class: "muted" }, ["Haz una foto del ticket o súbelo. MyExpenses lo lee y lo clasifica."]),
    ])
  );

  // input cámara
  const camInput = el("input", { type: "file", accept: "image/*", class: "hidden" });
  camInput.setAttribute("capture", "environment");
  camInput.addEventListener("change", () => {
    const f = camInput.files?.[0];
    if (f) handleFile(f);
  });

  // input subir
  const upInput = el("input", { type: "file", accept: "image/*", class: "hidden" });
  upInput.addEventListener("change", () => {
    const f = upInput.files?.[0];
    if (f) handleFile(f);
  });

  const btnCam = el("button", { class: "btn btn-primary big" }, ["📷  Hacer foto"]);
  btnCam.addEventListener("click", () => camInput.click());

  const btnUp = el("button", { class: "btn btn-ghost big" }, ["⬆️  Subir imagen"]);
  btnUp.addEventListener("click", () => upInput.click());

  wrap.append(el("div", { class: "actions-col" }, [btnCam, btnUp, camInput, upInput]));
  return wrap;
}

function reviewForm(r: ParsedReceipt): HTMLElement {
  const card = el("div", { class: "card review" });
  card.append(el("h3", {}, ["Revisar y confirmar"]));

  const merchant = el("input", { class: "field", value: r.merchant, placeholder: "Comercio" });
  const total = el("input", { class: "field", type: "number", step: "0.01", value: r.total != null ? String(r.total) : "", placeholder: "Importe" });
  const currency = el("input", { class: "field", value: r.currency, placeholder: "Moneda" });
  const date = el("input", { class: "field", type: "date", value: r.date ?? new Date().toISOString().slice(0, 10) });
  const note = el("input", { class: "field", value: "", placeholder: "Nota (opcional)" });

  const cat = el("select", { class: "field" });
  for (const c of CATEGORIES) {
    const o = el("option", { value: c }, [c]);
    if (c === r.category) o.selected = true;
    cat.append(o);
  }

  card.append(
    labeled("Comercio", merchant),
    labeled("Importe", total),
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
    if (!Number.isFinite(t)) {
      alert("Indica un importe válido.");
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

function labeled(label: string, input: HTMLElement): HTMLElement {
  return el("label", { class: "labeled" }, [el("span", { class: "label" }, [label]), input]);
}

function viewGastos(): HTMLElement {
  const wrap = el("section", { class: "view" });
  const list = state.expenses;

  if (list.length === 0) {
    wrap.append(
      el("div", { class: "empty" }, [
        el("div", { class: "empty-icon" }, ["🧾"]),
        el("p", { class: "muted" }, ["Aún no hay gastos. Captura tu primer ticket."]),
      ])
    );
    return wrap;
  }

  const totalGastado = list.reduce((s, e) => s + e.total, 0);
  const byCat = new Map<string, number>();
  for (const e of list) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.total);

  wrap.append(
    el("div", { class: "summary" }, [
      el("div", { class: "summary-total" }, [
        el("span", { class: "muted" }, ["Total gastado"]),
        el("strong", {}, [money(totalGastado, list[0].currency)]),
      ]),
    ])
  );

  const chips = el("div", { class: "chips" });
  [...byCat.entries()].sort((a, b) => b[1] - a[1]).forEach(([c, v]) => {
    chips.append(el("span", { class: "chip" }, [`${c} · ${money(v, list[0].currency)}`]));
  });
  wrap.append(chips);

  const exportBtn = el("button", { class: "btn btn-primary" }, ["⬇️  Exportar a Excel (.xlsx)"]);
  exportBtn.addEventListener("click", () => exportToXlsx(list));
  wrap.append(el("div", { class: "actions-row end" }, [exportBtn]));

  const items = el("div", { class: "list" });
  for (const e of list) {
    const row = el("div", { class: "expense" }, [
      el("div", { class: "expense-main" }, [
        el("div", { class: "expense-merchant" }, [e.merchant]),
        el("div", { class: "expense-meta" }, [`${e.date} · ${e.category}`]),
      ]),
      el("div", { class: "expense-amount" }, [money(e.total, e.currency)]),
    ]);
    const del = el("button", { class: "icon-btn", title: "Eliminar" }, ["✕"]);
    del.addEventListener("click", () => {
      state.expenses = deleteExpense(e.id);
      render();
    });
    row.append(del);
    items.append(row);
  }
  wrap.append(items);
  return wrap;
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
    { id: "capturar", label: "Capturar", icon: "📷" },
    { id: "gastos", label: "Gastos", icon: "📊" },
    { id: "info", label: "Info", icon: "ⓘ" },
  ];
  const bar = el("nav", { class: "tabbar" });
  for (const t of tabs) {
    const b = el("button", { class: "tab" + (state.tab === t.id ? " active" : "") }, [
      el("span", { class: "tab-icon" }, [t.icon]),
      el("span", { class: "tab-label" }, [t.label]),
    ]);
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
      el("span", { class: "brand-dot" }),
      el("span", { class: "brand-name" }, ["MyExpenses"]),
    ]),
  ]);

  const main = el("main", { class: "content" });
  if (state.tab === "capturar") main.append(viewCapturar());
  else if (state.tab === "gastos") main.append(viewGastos());
  else main.append(viewInfo());

  app.append(header, main, nav());
}

render();

// registro del service worker (PWA)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
