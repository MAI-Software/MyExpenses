import type { Recurring, Settings } from "./types";
import { loadNotified, saveNotified } from "./store";

// Aviso de cobros recurrentes mediante la Notification API del navegador.
// Nota honesta: sin servidor de push, las notificaciones se comprueban cuando la
// app/PWA está abierta (al arrancar y al entrar en Estrategia). No hay push en
// segundo plano garantizado en una PWA estática.

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  try {
    const perm = await Notification.requestPermission();
    return perm === "granted";
  } catch {
    return false;
  }
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Próxima fecha de cobro (>= hoy) de un gasto fijo. */
export function nextChargeDate(r: Recurring, from = new Date()): Date {
  const today = atMidnight(from);

  if (r.frequency === "yearly") {
    const month = r.month ?? 0;
    for (let y = today.getFullYear(); y <= today.getFullYear() + 1; y++) {
      const day = Math.min(r.dayOfMonth, daysInMonth(y, month));
      const candidate = new Date(y, month, day);
      if (candidate >= today) return candidate;
    }
    return new Date(today.getFullYear() + 1, month, r.dayOfMonth);
  }

  // mensual
  for (let i = 0; i <= 1; i++) {
    const y = today.getFullYear();
    const m = today.getMonth() + i;
    const dt = new Date(y, m, 1);
    const day = Math.min(r.dayOfMonth, daysInMonth(dt.getFullYear(), dt.getMonth()));
    const candidate = new Date(dt.getFullYear(), dt.getMonth(), day);
    if (candidate >= today) return candidate;
  }
  // fallback (no debería ocurrir)
  return new Date(today.getFullYear(), today.getMonth() + 1, r.dayOfMonth);
}

export function daysUntil(date: Date, from = new Date()): number {
  const ms = atMidnight(date).getTime() - atMidnight(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function whenLabel(days: number): string {
  if (days <= 0) return "hoy";
  if (days === 1) return "mañana";
  return `en ${days} días`;
}

/**
 * Comprueba los gastos fijos próximos y lanza notificaciones (con dedupe por
 * ocurrencia). Devuelve el número de avisos lanzados.
 */
export function checkAndNotify(
  recurrings: Recurring[],
  settings: Settings,
  fmtMoney: (amount: number, currency: string) => string
): number {
  if (!settings.notificationsEnabled) return 0;
  if (notificationPermission() !== "granted") return 0;

  const notified = new Set(loadNotified());
  let fired = 0;

  for (const r of recurrings.filter((x) => x.active)) {
    const due = nextChargeDate(r);
    const d = daysUntil(due);
    if (d <= settings.notifyDaysBefore) {
      const key = `${r.id}:${due.toISOString().slice(0, 10)}`;
      if (!notified.has(key)) {
        try {
          new Notification("MyExpenses", {
            body: `${capitalize(whenLabel(d))} se cobra ${r.name} · ${fmtMoney(r.amount, r.currency)}`,
            icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
            badge: `${import.meta.env.BASE_URL}icons/icon-192.png`,
            tag: key,
          });
          fired++;
        } catch {
          /* el navegador puede bloquear si no hay gesto de usuario */
        }
        notified.add(key);
      }
    }
  }

  saveNotified([...notified]);
  return fired;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
