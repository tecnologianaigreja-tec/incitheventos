export type LabelElementType = "text" | "qrcode";

export interface LabelElement {
  id: string;
  type: LabelElementType;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
  font_size_pt?: number;
  font_weight?: "normal" | "bold";
  align?: "left" | "center" | "right";
  /**
   * Data source key:
   * - Fixed: "full_name" | "registration_code" | "cpf" | "phone" | "email" | "congregation" | "church_role" | "church_function" | "area" | "qr_token"
   * - Custom: "custom:<field_key>"
   * - Static: "static"
   */
  source: string;
  static_text?: string | null;
}

export interface LabelTemplate {
  id: string;
  width_mm: number;
  height_mm: number;
  elements: LabelElement[];
  updated_at: string;
}

export const FIXED_SOURCES: { key: string; label: string }[] = [
  { key: "full_name", label: "Nome completo" },
  { key: "registration_code", label: "Código de inscrição" },
  { key: "cpf", label: "CPF" },
  { key: "phone", label: "Telefone" },
  { key: "email", label: "E-mail" },
  { key: "congregation", label: "Congregação" },
  { key: "area", label: "Área" },
  { key: "church_role", label: "Cargo" },
  { key: "church_function", label: "Função" },
  { key: "qr_token", label: "QR Code (check-in)" },
  { key: "static", label: "Texto fixo" },
];

// Aliases mapping fixed source keys to common custom_fields keys (case/spacing/diacritic-insensitive)
const FIXED_FALLBACK_ALIASES: Record<string, string[]> = {
  congregation: ["congregacao", "congregação", "igreja", "congreg"],
  area: ["area", "área", "areadecong", "areadecongregacao", "areadecongaquepertence"],
  church_role: ["cargo", "funcaoministerial", "função ministerial", "ministerio", "ministério", "departamento"],
  church_function: ["funcao", "função", "funcaoministerial", "função ministerial"],
  phone: ["telefone", "celular", "whatsapp"],
};

function normalizeKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function findInCustomFields(cf: Record<string, any>, candidates: string[]): string {
  const normMap: Record<string, any> = {};
  for (const [k, v] of Object.entries(cf)) {
    normMap[normalizeKey(k)] = v;
  }
  for (const cand of candidates) {
    const n = normalizeKey(cand);
    if (normMap[n] != null && normMap[n] !== "") return String(normMap[n]);
  }
  // Substring match as a last resort
  for (const cand of candidates) {
    const n = normalizeKey(cand);
    for (const [k, v] of Object.entries(normMap)) {
      if (v != null && v !== "" && (k.includes(n) || n.includes(k))) return String(v);
    }
  }
  return "";
}

export function resolveValue(
  source: string,
  registration: Record<string, any>,
  staticText?: string | null
): string {
  if (source === "static") return staticText || "";
  const cf = (registration.custom_fields || {}) as Record<string, any>;
  if (source.startsWith("custom:")) {
    const key = source.slice("custom:".length);
    if (cf[key] != null && cf[key] !== "") return String(cf[key]);
    // Fuzzy fallback for custom keys (handles trailing spaces / case differences)
    return findInCustomFields(cf, [key]);
  }
  const v = registration[source];
  if (v != null && v !== "") return String(v);
  // Fallback: try to resolve fixed sources from custom_fields
  const aliases = FIXED_FALLBACK_ALIASES[source];
  if (aliases) return findInCustomFields(cf, [source, ...aliases]);
  return "";
}
