// Plan compartido vía Google Sheets (100% cliente, sin servidor).
// Cada persona conecta SU cuenta de Google. La app solo necesita un Client ID
// (gratis) creado una vez por el dueño. Un "plan" = una hoja de Google
// compartida; varias personas (pareja/familia) sincronizan en ella.
import type { Expense } from "./types";

// ┌──────────────────────────────────────────────────────────────────┐
// │  RELLENA ESTO (gratis — ver README, sección "Google Drive"):       │
// │  clientId: ID de cliente OAuth web (.apps.googleusercontent.com).   │
// │  Orígenes JS autorizados: https://mai-software.github.io y          │
// │  http://localhost:5173                                              │
// └──────────────────────────────────────────────────────────────────┘
export const GOOGLE_CONFIG = {
  clientId: "", // <-- pega aquí tu Client ID
};

// drive.file: crear/compartir la hoja del plan (archivos de la app).
// spreadsheets: leer/escribir una hoja compartida por su id (al unirse por enlace).
const SCOPES =
  "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets";

const SHEET_ID_KEY = "myexpenses.drive.sheetId";
const SHEET_NAME = "MyExpenses";
const HEADER = ["id", "Fecha", "Comercio", "Categoría", "Importe", "Moneda", "Nota"];

let accessToken: string | null = null;
let tokenExpiry = 0;
let tokenClient: any = null;

export function driveConfigured(): boolean {
  return !!GOOGLE_CONFIG.clientId;
}
export function isConnected(): boolean {
  return !!accessToken && Date.now() < tokenExpiry;
}
export function getSheetId(): string | null {
  return localStorage.getItem(SHEET_ID_KEY);
}
export function setSheetId(id: string | null): void {
  if (id) localStorage.setItem(SHEET_ID_KEY, id);
  else localStorage.removeItem(SHEET_ID_KEY);
}
export function sheetUrl(): string | null {
  const id = getSheetId();
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
}

// Enlace de invitación: la propia URL de la app con el plan en el hash.
// Quien no tenga la app instalada aterriza en GitHub Pages igualmente.
export function inviteUrl(id = getSheetId()): string | null {
  if (!id) return null;
  const base = location.href.split("#")[0];
  return `${base}#plan=${id}`;
}

// Lee un plan del hash (#plan=ID) al abrir un enlace de invitación.
export function consumePlanFromHash(): string | null {
  const m = location.hash.match(/[#&]plan=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const id = m[1];
  setSheetId(id);
  // limpia el hash sin recargar
  history.replaceState(null, "", location.href.split("#")[0]);
  return id;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.append(s);
  });
}

export async function connect(): Promise<void> {
  if (!driveConfigured()) throw new Error("Falta el Client ID de Google.");
  await loadScript("https://accounts.google.com/gsi/client");
  await new Promise<void>((resolve, reject) => {
    try {
      tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CONFIG.clientId,
        scope: SCOPES,
        callback: (resp: any) => {
          if (resp.error) return reject(new Error(resp.error));
          accessToken = resp.access_token;
          const ms = resp.expires_in ? resp.expires_in * 1000 : 3600_000;
          tokenExpiry = Date.now() + ms - 60_000;
          resolve();
        },
      });
      tokenClient.requestAccessToken({ prompt: "" });
    } catch (e) {
      reject(e as Error);
    }
  });
}

export function disconnect(): void {
  const t = accessToken;
  accessToken = null;
  tokenExpiry = 0;
  if (t && (window as any).google?.accounts?.oauth2) {
    try {
      (window as any).google.accounts.oauth2.revoke(t);
    } catch {
      /* ignore */
    }
  }
}

async function api(url: string, opts: RequestInit = {}): Promise<any> {
  if (!isConnected()) await connect();
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Google API ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.status === 204 ? null : res.json();
}

function rowFromExpense(e: Expense): (string | number)[] {
  return [e.id, e.date, e.merchant, e.category, e.total, e.currency, e.note || ""];
}
function expenseFromRow(r: any[]): Expense {
  return {
    id: String(r[0]),
    date: String(r[1] || ""),
    merchant: String(r[2] || "Comercio"),
    category: String(r[3] || "Otros"),
    total: parseFloat(String(r[4]).replace(",", ".")) || 0,
    currency: String(r[5] || "EUR"),
    note: String(r[6] || ""),
    rawText: "",
    createdAt: Date.now(),
  };
}

async function ensureHeader(id: string): Promise<void> {
  const got = await api(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/A1:G1`
  );
  if (!got.values || !got.values.length) {
    await api(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/A1?valueInputOption=USER_ENTERED`,
      { method: "PUT", body: JSON.stringify({ values: [HEADER] }) }
    );
  }
}

// Crea la hoja del plan y devuelve su id.
export async function createPlan(): Promise<string> {
  const created = await api("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    body: JSON.stringify({ properties: { title: SHEET_NAME } }),
  });
  const id = created.spreadsheetId as string;
  setSheetId(id);
  await ensureHeader(id);
  return id;
}

// Permiso "cualquiera con el enlace puede editar" (para invitar por WhatsApp).
export async function shareAnyoneWithLink(role: "reader" | "writer" = "writer"): Promise<void> {
  const id = getSheetId();
  if (!id) throw new Error("No hay plan activo.");
  await api(`https://www.googleapis.com/drive/v3/files/${id}/permissions`, {
    method: "POST",
    body: JSON.stringify({ type: "anyone", role, allowFileDiscovery: false }),
  });
}

// Invitar a una persona concreta por email.
export async function shareWith(email: string, role: "reader" | "writer" = "writer"): Promise<void> {
  const id = getSheetId();
  if (!id) throw new Error("No hay plan activo.");
  await api(
    `https://www.googleapis.com/drive/v3/files/${id}/permissions?sendNotificationEmail=true`,
    { method: "POST", body: JSON.stringify({ type: "user", role, emailAddress: email }) }
  );
}

export interface SyncResult {
  added: number;
  pulled: Expense[];
}

// Sincroniza con la hoja del plan: sube las filas nuevas (por id) y devuelve
// las que están en la hoja pero no en local. No sobrescribe nada.
export async function syncExpenses(local: Expense[]): Promise<SyncResult> {
  const id = getSheetId();
  if (!id) throw new Error("No hay plan activo. Crea uno o únete por enlace.");
  await ensureHeader(id);

  const got = await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/A2:G`);
  const rows: any[][] = got.values || [];
  const sheetIds = new Set(rows.map((r) => String(r[0])).filter(Boolean));
  const localIds = new Set(local.map((e) => e.id));

  const toAppend = local.filter((e) => !sheetIds.has(e.id));
  if (toAppend.length) {
    await api(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: "POST", body: JSON.stringify({ values: toAppend.map(rowFromExpense) }) }
    );
  }

  const pulled = rows
    .filter((r) => r[0] && !localIds.has(String(r[0])))
    .map(expenseFromRow);

  return { added: toAppend.length, pulled };
}
