import jsPDF from "jspdf";

export interface FieldPosition {
  id: string;
  /** Variable key OR "text" for free-form text */
  key: string;
  /** Raw content (may contain {nome}, {evento}, {data_inicio}, {data_fim}, {carga_horaria}, {codigo}, {validacao}) */
  content: string;
  /** Position & size in % of the page (0–100) */
  x: number;
  y: number;
  w: number;
  h: number;
  fontFamily: "helvetica" | "times" | "courier";
  fontSize: number;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  align: "left" | "center" | "right";
  /** Hex color e.g. #1e3a5f */
  color: string;
}

export interface CertificatePdfOptions {
  backgroundUrl?: string | null;
  fieldPositions: FieldPosition[];
  participantName: string;
  eventTitle: string;
  startDate: string;
  endDate: string;
  workloadHours?: number | null;
  certificateCode: string;
  validationHash: string;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return [40, 40, 40];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function substituteVars(content: string, opts: CertificatePdfOptions): string {
  return (content || "")
    .replace(/\{nome\}/g, opts.participantName || "")
    .replace(/\{evento\}/g, opts.eventTitle || "")
    .replace(/\{data_inicio\}/g, opts.startDate || "")
    .replace(/\{data_fim\}/g, opts.endDate || "")
    .replace(/\{carga_horaria\}/g, opts.workloadHours != null ? String(opts.workloadHours) : "—")
    .replace(/\{codigo\}/g, opts.certificateCode || "")
    .replace(/\{validacao\}/g, opts.validationHash || "");
}

export async function generateCertificatePdf(options: CertificatePdfOptions): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = 297;
  const pageH = 210;

  // Background image fills the entire page
  if (options.backgroundUrl) {
    try {
      const img = await loadImage(options.backgroundUrl);
      const fmt = /\.png(\?|$)/i.test(options.backgroundUrl) ? "PNG" : "JPEG";
      doc.addImage(img, fmt, 0, 0, pageW, pageH);
    } catch (e) {
      console.warn("[certificatePdf] failed to load background", e);
    }
  }

  for (const field of options.fieldPositions || []) {
    const text = substituteVars(field.content, options);
    if (!text) continue;

    const xMm = (field.x / 100) * pageW;
    const yMm = (field.y / 100) * pageH;
    const wMm = (field.w / 100) * pageW;

    const family = field.fontFamily || "helvetica";
    // jsPDF font style strings: "normal" | "bold" | "italic" | "bolditalic"
    let style = "normal";
    if (field.fontWeight === "bold" && field.fontStyle === "italic") style = "bolditalic";
    else if (field.fontWeight === "bold") style = "bold";
    else if (field.fontStyle === "italic") style = "italic";

    doc.setFont(family, style);
    doc.setFontSize(field.fontSize || 12);
    const [r, g, b] = hexToRgb(field.color || "#282828");
    doc.setTextColor(r, g, b);

    const lines = doc.splitTextToSize(text, Math.max(wMm, 1)) as string[];

    let drawX = xMm;
    if (field.align === "center") drawX = xMm + wMm / 2;
    else if (field.align === "right") drawX = xMm + wMm;

    doc.text(lines, drawX, yMm, { align: field.align, baseline: "top" });
  }

  return doc;
}
