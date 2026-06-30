import type { Budget, CustomCategory, Expense, Recurring, Settings } from "./types";

const KEY = "myexpenses.v1";
const BKEY = "myexpenses.budget.v1";
const RKEY = "myexpenses.recurring.v1";
const SKEY = "myexpenses.settings.v1";
const NKEY = "myexpenses.notified.v1";
const CCKEY = "myexpenses.categories.v1";

export function loadExpenses(): Expense[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Expense[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveExpenses(list: Expense[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function addExpense(e: Expense): Expense[] {
  const list = loadExpenses();
  list.unshift(e);
  saveExpenses(list);
  return list;
}

export function deleteExpense(id: string): Expense[] {
  const list = loadExpenses().filter((e) => e.id !== id);
  saveExpenses(list);
  return list;
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- presupuesto / topes ----------
const DEFAULT_BUDGET: Budget = { monthlyCap: null, categoryCaps: {}, currency: "EUR" };

export function loadBudget(): Budget {
  try {
    const raw = localStorage.getItem(BKEY);
    if (!raw) return { ...DEFAULT_BUDGET };
    const b = JSON.parse(raw) as Budget;
    return { ...DEFAULT_BUDGET, ...b, categoryCaps: b.categoryCaps ?? {} };
  } catch {
    return { ...DEFAULT_BUDGET };
  }
}
export function saveBudget(b: Budget): void {
  localStorage.setItem(BKEY, JSON.stringify(b));
}

// ---------- gastos fijos / recurrentes ----------
export function loadRecurring(): Recurring[] {
  try {
    const arr = JSON.parse(localStorage.getItem(RKEY) ?? "[]") as Recurring[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
export function saveRecurring(list: Recurring[]): void {
  localStorage.setItem(RKEY, JSON.stringify(list));
}

// ---------- ajustes ----------
const DEFAULT_SETTINGS: Settings = { notificationsEnabled: false, notifyDaysBefore: 1 };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SKEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Settings) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function saveSettings(s: Settings): void {
  localStorage.setItem(SKEY, JSON.stringify(s));
}

// ---------- avisos ya enviados (dedupe de notificaciones) ----------
export function loadNotified(): string[] {
  try {
    const arr = JSON.parse(localStorage.getItem(NKEY) ?? "[]") as string[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
export function saveNotified(keys: string[]): void {
  localStorage.setItem(NKEY, JSON.stringify(keys.slice(-200)));
}

// ---------- categorías personalizadas ----------
export function loadCustomCategories(): CustomCategory[] {
  try {
    const arr = JSON.parse(localStorage.getItem(CCKEY) ?? "[]") as CustomCategory[];
    return Array.isArray(arr) ? arr.filter((c) => c && typeof c.name === "string") : [];
  } catch {
    return [];
  }
}
export function saveCustomCategories(list: CustomCategory[]): void {
  localStorage.setItem(CCKEY, JSON.stringify(list));
}
