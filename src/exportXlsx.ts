import type { Expense } from "./types";

export async function exportToXlsx(list: Expense[]): Promise<void> {
  // Carga diferida: SheetJS solo se descarga al exportar.
  const XLSX = await import("xlsx");
  const rows = list.map((e) => ({
    Fecha: e.date,
    Comercio: e.merchant,
    Categoría: e.category,
    Importe: e.total,
    Moneda: e.currency,
    Nota: e.note,
  }));

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ["Fecha", "Comercio", "Categoría", "Importe", "Moneda", "Nota"],
  });
  ws["!cols"] = [
    { wch: 12 },
    { wch: 28 },
    { wch: 16 },
    { wch: 10 },
    { wch: 8 },
    { wch: 30 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Gastos");

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `MyExpenses_${stamp}.xlsx`);
}
