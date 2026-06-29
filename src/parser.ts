import type { ParsedReceipt } from "./types";
import { classify } from "./classify";

const CURRENCY_MAP: Record<string, string> = {
  "€": "EUR",
  eur: "EUR",
  euro: "EUR",
  euros: "EUR",
  $: "USD",
  usd: "USD",
  "£": "GBP",
  gbp: "GBP",
};

function detectCurrency(text: string): string {
  const low = text.toLowerCase();
  for (const [token, code] of Object.entries(CURRENCY_MAP)) {
    if (low.includes(token)) return code;
  }
  return "EUR";
}

// Normaliza "1.234,56" o "1,234.56" o "12,50" -> 1234.56 / 12.5
function parseAmount(raw: string): number | null {
  let s = raw.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // coma decimal (formato ES): quitar puntos de miles, coma -> punto
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // punto decimal: quitar comas de miles
    s = s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// Extrae todos los importes con su posición para heurística.
function allAmounts(text: string): number[] {
  const re = /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2})/g;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = parseAmount(m[1]);
    if (n !== null) out.push(n);
  }
  return out;
}

function detectTotal(lines: string[], fullText: string): number | null {
  // Prioriza líneas con palabra clave de total.
  const KEYS = ["total a pagar", "total", "importe", "a pagar", "total eur"];
  const EXCLUDE = ["subtotal", "base imponible", "total iva", "iva", "cambio", "entregado"];
  let best: number | null = null;
  for (const line of lines) {
    const low = line.toLowerCase();
    if (EXCLUDE.some((e) => low.includes(e)) && !low.includes("total a pagar")) continue;
    if (KEYS.some((k) => low.includes(k))) {
      const amts = allAmounts(line);
      if (amts.length) best = Math.max(best ?? 0, amts[amts.length - 1]);
    }
  }
  if (best !== null) return best;
  // Fallback: importe mayor del ticket.
  const all = allAmounts(fullText);
  return all.length ? Math.max(...all) : null;
}

function detectDate(text: string): string | null {
  // dd/mm/yyyy, dd-mm-yyyy, dd.mm.yy
  const m = text.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = "20" + y;
  const dd = d.padStart(2, "0");
  const mm = mo.padStart(2, "0");
  if (+mm > 12 || +dd > 31) return null;
  return `${y}-${mm}-${dd}`;
}

function detectMerchant(lines: string[]): string {
  for (const line of lines) {
    const t = line.trim();
    // Primera línea con letras y longitud razonable, sin parecer importe/fecha.
    if (t.length >= 3 && /[a-zA-ZÀ-ÿ]/.test(t) && !/^\d/.test(t)) {
      return t.slice(0, 60);
    }
  }
  return "Comercio";
}

export function parseReceipt(rawText: string): ParsedReceipt {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const merchant = detectMerchant(lines);
  const total = detectTotal(lines, rawText);
  const date = detectDate(rawText);
  const currency = detectCurrency(rawText);
  const category = classify(merchant, rawText);
  return { merchant, total, currency, date, category, rawText };
}
