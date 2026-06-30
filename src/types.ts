export const CATEGORIES = [
  "Alimentación",
  "Restauración",
  "Comida a domicilio",
  "Transporte",
  "Compras",
  "Salud",
  "Ocio",
  "Caprichos",
  "Hogar",
  "Servicios",
  "Otros",
] as const;

export type BuiltinCategory = (typeof CATEGORIES)[number];

/** Categoría: integrada o personalizada (creada por el usuario). */
export type Category = string;

/** Categoría personalizada creada por el usuario. */
export interface CustomCategory {
  name: string;
  color: string;
  icon?: string;
}

export type Frequency = "monthly" | "yearly";

/** Topes de gasto: global mensual + por categoría. */
export interface Budget {
  monthlyCap: number | null;
  categoryCaps: Partial<Record<Category, number>>;
  currency: string;
}

/** Gasto fijo / recurrente (Netflix, alquiler, seguro…). */
export interface Recurring {
  id: string;
  name: string;
  amount: number;
  currency: string;
  category: Category;
  frequency: Frequency;
  dayOfMonth: number; // 1-31 (se ajusta a meses cortos)
  month?: number;     // 0-11, sólo si frequency = "yearly"
  active: boolean;
  createdAt: number;
}

export interface Settings {
  notificationsEnabled: boolean;
  notifyDaysBefore: number; // 0 = el mismo día, 1 = un día antes…
}

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  merchant: string;
  total: number;
  currency: string; // EUR, USD...
  category: Category;
  note: string;
  rawText: string;
  createdAt: number;
}

export interface ParsedReceipt {
  merchant: string;
  total: number | null;
  currency: string;
  date: string | null;
  category: Category;
  rawText: string;
}
