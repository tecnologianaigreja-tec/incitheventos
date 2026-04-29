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

export function resolveValue(
  source: string,
  registration: Record<string, any>,
  staticText?: string | null
): string {
  if (source === "static") return staticText || "";
  if (source.startsWith("custom:")) {
    const key = source.slice("custom:".length);
    const cf = (registration.custom_fields || {}) as Record<string, any>;
    return cf[key] != null ? String(cf[key]) : "";
  }
  const v = registration[source];
  return v != null ? String(v) : "";
}
