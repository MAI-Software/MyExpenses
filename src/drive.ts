// Integración con Google Drive / Sheets (100% cliente, sin servidor).
// Cada usuario conecta SU propia cuenta de Google y autoriza SU Drive.
// Requiere un Client ID de OAuth (gratis) creado una vez por el dueño de la app.
import type { Expense } from "./types";

// ┌──────────────────────────────────────────────────────────────────┐
// │  RELLENA ESTO (gratis — ver README, sección "Google Drive"):       │
// │  - clientId: ID de cliente OAuth web (acaba en                     │
// │    .apps.googleusercontent.com). Orígenes JS autorizados deben      │
// │    incluir https://mai-software.github.io y http://localhost:5173   │
// │  - apiKey: OPCIONAL, solo para el selector de archivos existentes   │
// │    (Google Picker). Si lo dejas vacío, el resto funciona igual.     │
// └──────────────────────────────────────────────────────────────────┘
export const GOOGLE_CONFIG = {
  clientId: "", // <-- pega aquí tu Client ID
  apiKey: "",   // <-- (opcional) API key para el selector
};

const SCOPES = "https://www.googleapis.com/auth/drive.file";
const SHEET_ID_KEY = "myexpenses.drive.sheetId";
const SHEET_NAME = "MyExpenses";

let accessToken: string | null = null;
let tokenExpiry = 0;
let tokenClient: any = null;

export function driveConfigured(): boolean {
  return !!GOOGLE_CONFIG.clientId;
}
export function pickerAvailable(): boolean {
  return !!GOOGLE_CONFIG.apiKey;
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

// Pide (o renueva) un token de acceso del usuario vía Google Identity Services.
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

// Crea (o reutiliza) la hoja "MyExpenses" en el Drive del usuario.
export async function ensureSheet(): Promise<string> {
  const existing = getSheetId();
  if (existing) return existing;
  const created = await api("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    body: JSON.stringify({ properties: { title: SHEET_NAME } }),
  });
  setSheetId(created.spreadsheetId);
  return created.spreadsheetId;
}

const HEADER = ["Fecha", "Comercio", "Categoría", "Importe", "Moneda", "Nota"];

// Vuelca todos los gastos en la hoja (cabecera + filas, sobrescribiendo).
export async function pushExpenses(list: Expense[]): Promise<number> {
  const id = await ensureSheet();
  const values = [
    HEADER,
    ...list.map((e) => [e.date, e.merchant, e.category, e.total, e.currency, e.note || ""]),
  ];
  await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/A:F:clear`, {
    method: "POST",
    body: "{}",
  });
  await api(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/A1?valueInputOption=USER_ENTERED`,
    { method: "PUT", body: JSON.stringify({ values }) }
  );
  return list.length;
}

// Comparte la hoja con un tercero por email (editor por defecto).
export async function shareWith(email: string, role: "reader" | "writer" = "writer"): Promise<void> {
  const id = await ensureSheet();
  await api(
    `https://www.googleapis.com/drive/v3/files/${id}/permissions?sendNotificationEmail=true`,
    { method: "POST", body: JSON.stringify({ type: "user", role, emailAddress: email }) }
  );
}

// Selector de hoja/Excel ya existente en Drive (requiere apiKey). Devuelve el id elegido.
export async function pickExisting(): Promise<string | null> {
  if (!pickerAvailable()) throw new Error("Falta la API key para el selector.");
  if (!isConnected()) await connect();
  await loadScript("https://apis.google.com/js/api.js");
  await new Promise<void>((resolve) => (window as any).gapi.load("picker", { callback: () => resolve() }));
  const g = (window as any).google;
  return await new Promise<string | null>((resolve) => {
    const picker = new g.picker.PickerBuilder()
      .addView(g.picker.ViewId.SPREADSHEETS)
      .setOAuthToken(accessToken)
      .setDeveloperKey(GOOGLE_CONFIG.apiKey)
      .setCallback((data: any) => {
        if (data.action === g.picker.Action.PICKED) {
          const id = data.docs?.[0]?.id ?? null;
          if (id) setSheetId(id);
          resolve(id);
        } else if (data.action === g.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    picker.setVisible(true);
  });
}
