export const CATEGORIES = [
  "Alimentación",
  "Restauración",
  "Transporte",
  "Compras",
  "Salud",
  "Ocio",
  "Hogar",
  "Servicios",
  "Otros",
] as const;

export type Category = (typeof CATEGORIES)[number];

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
