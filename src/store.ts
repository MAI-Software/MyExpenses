import type { Expense } from "./types";

const KEY = "myexpenses.v1";

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
