import { CATEGORIES, type Category } from "./types";
import { loadCustomCategories } from "./store";

// Reglas por palabra clave. Se evalúa sobre comercio + texto OCR en minúsculas.
// Primera categoría que coincida gana (orden = prioridad).
const RULES: { category: Category; keywords: string[] }[] = [
  {
    // Plataformas de reparto primero: ganan a Restauración/Compras.
    category: "Comida a domicilio",
    keywords: [
      "glovo", "just eat", "justeat", "just-eat", "uber eats", "ubereats",
      "uber-eats", "deliveroo", "rappi", "a domicilio", "domicilios",
      "la nevera roja", "delivery", "pedido a domicilio", "reparto",
    ],
  },
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
  {
    // Baja prioridad: caprichos/antojos (no roba compras de super, va al final).
    category: "Caprichos",
    keywords: [
      "golosinas", "chuches", "chucherias", "chucherías", "gominolas", "helado",
      "heladeria", "heladería", "dulces", "candy", "kiosco", "kiosko",
      "pasteleria", "pastelería", "bombones",
    ],
  },
];

// Color suave por categoría (paleta tenue, coherente con la UI futurista).
export const CATEGORY_COLORS: Record<string, string> = {
  "Alimentación": "#5eead4",
  "Restauración": "#f5a97f",
  "Comida a domicilio": "#ed8796",
  "Transporte": "#8aadf4",
  "Compras": "#c6a0f6",
  "Salud": "#a6da95",
  "Ocio": "#f5bde6",
  "Caprichos": "#f6c177",
  "Hogar": "#eed49f",
  "Servicios": "#91d7e3",
  "Otros": "#939ab7",
};

// Paleta de reserva para categorías personalizadas sin color asignado.
const FALLBACK_PALETTE = [
  "#7dd3fc", "#fca5a5", "#fcd34d", "#a7f3d0",
  "#c4b5fd", "#f9a8d4", "#fdba74", "#94a3b8",
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Color de una categoría: integrada → personalizada → reserva determinista. */
export function categoryColor(cat: Category): string {
  if (CATEGORY_COLORS[cat]) return CATEGORY_COLORS[cat];
  const c = loadCustomCategories().find((x) => x.name === cat);
  if (c?.color) return c.color;
  return FALLBACK_PALETTE[hashStr(cat) % FALLBACK_PALETTE.length];
}

/** Lista completa de categorías (integradas + personalizadas), "Otros" al final. */
export function allCategories(): string[] {
  const custom = loadCustomCategories().map((c) => c.name);
  const merged = [...CATEGORIES.filter((c) => c !== "Otros"), ...custom, "Otros"];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of merged) {
    const key = c.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(c); }
  }
  return out;
}

export function classify(merchant: string, rawText: string): Category {
  const hay = `${merchant}\n${rawText}`.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => hay.includes(k))) return rule.category;
  }
  return "Otros";
}
