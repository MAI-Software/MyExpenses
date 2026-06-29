import type { Category } from "./types";

// Reglas por palabra clave. Se evalúa sobre comercio + texto OCR en minúsculas.
// Primera categoría que coincida gana (orden = prioridad).
const RULES: { category: Category; keywords: string[] }[] = [
  {
    category: "Alimentación",
    keywords: [
      "mercadona", "carrefour", "lidl", "aldi", "dia", "eroski", "consum",
      "alcampo", "supermercado", "super ", "fruteria", "frutería", "panaderia",
      "panadería", "carniceria", "carnicería", "pescaderia", "pescadería",
      "hipercor", "grocery", "market",
    ],
  },
  {
    category: "Restauración",
    keywords: [
      "restaurante", "bar ", "cafeteria", "cafetería", "cafe", "café", "mcdonald",
      "burger", "kfc", "telepizza", "dominos", "domino's", "pizza", "kebab",
      "tapas", "menu del dia", "menú del día", "starbucks", "coffee", "bebida",
      "cocina", "comida",
    ],
  },
  {
    category: "Transporte",
    keywords: [
      "gasolinera", "repsol", "cepsa", "bp ", "shell", "galp", "combustible",
      "diesel", "gasolina", "parking", "aparcamiento", "peaje", "uber", "cabify",
      "taxi", "metro", "renfe", "autobus", "autobús", "billete", "estacion",
      "estación", "vuelo", "ryanair", "iberia", "vueling",
    ],
  },
  {
    category: "Salud",
    keywords: [
      "farmacia", "parafarmacia", "clinica", "clínica", "dental", "optica",
      "óptica", "hospital", "medico", "médico", "fisio", "pharmacy",
    ],
  },
  {
    category: "Hogar",
    keywords: [
      "ikea", "leroy", "bricomart", "bricodepot", "ferreteria", "ferretería",
      "muebles", "decoracion", "decoración", "hogar", "menaje",
    ],
  },
  {
    category: "Compras",
    keywords: [
      "zara", "h&m", "primark", "el corte ingles", "el corte inglés", "amazon",
      "mediamarkt", "media markt", "fnac", "decathlon", "pull&bear", "bershka",
      "stradivarius", "tienda", "moda", "ropa", "calzado", "electronica",
      "electrónica", "shop",
    ],
  },
  {
    category: "Ocio",
    keywords: [
      "cine", "cinema", "teatro", "concierto", "netflix", "spotify", "hbo",
      "disney", "prime video", "steam", "playstation", "xbox", "nintendo",
      "gimnasio", "gym", "entrada",
    ],
  },
  {
    category: "Servicios",
    keywords: [
      "movistar", "vodafone", "orange", "yoigo", "endesa", "iberdrola", "naturgy",
      "factura", "luz", "agua", "gas", "internet", "telefono", "teléfono",
      "seguro", "banco", "comision", "comisión", "suscripcion", "suscripción",
    ],
  },
];

export function classify(merchant: string, rawText: string): Category {
  const hay = `${merchant}\n${rawText}`.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => hay.includes(k))) return rule.category;
  }
  return "Otros";
}
