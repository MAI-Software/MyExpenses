import "./style.css";
import { CATEGORIES, type Category, type Expense, type ParsedReceipt } from "./types";
import { CATEGORY_COLORS } from "./classify";
import { icon, CATEGORY_ICON } from "./icons";
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
  error: string | null;
}

const state: State = {
  tab: "capturar",
  expenses: loadExpenses(),
  review: null,
  busy: false,
  progress: 0,
  progressText: "",
  error: null,
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

  wrap.append(
    el("div", { class: "hero" }, [
      el("h2", {}, ["Captura un gasto"]),
      el("p", { class: "muted" }, ["Haz una foto del ticket o súbelo. MyExpenses lo lee y lo clasifica solo."]),
    ])
  );

  if (state.error) {
    wrap.append(
      el("div", { class: "alert", role: "alert" }, [
        icon("info", 18),
        el("span", {}, [state.error]),
      ])
    );
  }

  const dz = el("div", { class: "dropzone" }, [
    el("div", { class: "dz-icon" }, [icon("receipt", 30)]),
    el("p", { class: "muted small" }, ["Tu ticket, leído y clasificado en segundos."]),
  ]);
  wrap.append(dz);

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
  for (const c of CATEGORIES) {
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
        el("span", { class: "dot", style: `color:${CATEGORY_COLORS[c]};background:${CATEGORY_COLORS[c]}` }),
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
  list.forEach((e, i) => {
    const color = CATEGORY_COLORS[e.category];
    const row = el("div", { class: "expense", style: `--cat:${color};animation-delay:${i * 0.04}s` }, [
      el("div", { class: "exp-ico" }, [icon(CATEGORY_ICON[e.category], 20)]),
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
    items.append(row);
  });
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
    { id: "capturar", label: "Capturar", icon: "camera" },
    { id: "gastos", label: "Gastos", icon: "wallet" },
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

render();

// Service worker: SOLO en producción. En dev causaría servir assets cacheados
// (versiones viejas). En dev, además, desregistramos cualquier SW previo.
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
    });
  } else {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
    if ("caches" in window) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)));
  }
}
