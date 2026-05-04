import jsPDF from "jspdf";
import type { RegistrationData } from "@/lib/types";

interface EventInfo {
  title: string;
  start_date: string;
  end_date: string;
  unit_price_cents: number;
}

export interface GroupField {
  key: string;
  label: string;
  /** Resolver returning a normalized display string for the registration */
  getValue: (r: RegistrationData) => string;
}

export type GroupScope = "all" | "confirmed" | "paid";

interface GroupedReportOptions {
  event: EventInfo;
  registrations: RegistrationData[];
  filterDescription: string | null;
  groupBy: GroupField;
  subGroupBy?: GroupField | null;
  scope: GroupScope;
}

function fmtCurrency(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(d: string) {
  try { return new Date(d + "T00:00:00").toLocaleDateString("pt-BR"); } catch { return d; }
}

const NA = "(não informado)";

function normalizeKey(v: string): string {
  const t = (v || "").trim();
  return t.length === 0 ? NA : t;
}

function scopeLabel(s: GroupScope) {
  return s === "all" ? "Todos os inscritos" : s === "confirmed" ? "Apenas confirmados" : "Apenas pagos";
}

function filterByScope(regs: RegistrationData[], scope: GroupScope): RegistrationData[] {
  if (scope === "all") return regs;
  if (scope === "confirmed") return regs.filter(r => r.registration_status === "confirmed");
  return regs.filter(r => r.payment_status === "approved");
}

function groupBy<T>(arr: T[], keyFn: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const item of arr) {
    const k = keyFn(item);
    const list = m.get(k) || [];
    list.push(item);
    m.set(k, list);
  }
  return m;
}

export function generateGroupedReportPdf(opts: GroupedReportOptions): jsPDF {
  const { event, filterDescription, groupBy: gField, subGroupBy: sgField, scope } = opts;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const pageH = 297;
  const margin = 18;
  const contentW = pageW - margin * 2;
  let y = 20;

  const navy: [number, number, number] = [30, 58, 95];
  const dark: [number, number, number] = [40, 40, 40];
  const muted: [number, number, number] = [120, 120, 120];
  const accent: [number, number, number] = [45, 100, 160];

  // Apply scope
  const regs = filterByScope(opts.registrations, scope);

  // ---- Header ----
  doc.setDrawColor(...navy);
  doc.setLineWidth(1.2);
  doc.line(margin, y, pageW - margin, y); y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...navy);
  doc.text("RELATÓRIO QUANTITATIVO", pageW / 2, y, { align: "center" }); y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...muted);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, pageW / 2, y, { align: "center" }); y += 4;

  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y); y += 9;

  // ---- Event info ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...navy);
  doc.text(event.title, margin, y); y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...dark);
  doc.text(`Período: ${fmtDate(event.start_date)} a ${fmtDate(event.end_date)}`, margin, y); y += 5;
  doc.text(`Valor unitário: ${event.unit_price_cents > 0 ? fmtCurrency(event.unit_price_cents) : "Gratuito"}`, margin, y); y += 5;
  doc.text(`Agrupado por: ${gField.label}${sgField ? ` › ${sgField.label}` : ""}`, margin, y); y += 5;
  doc.text(`Escopo: ${scopeLabel(scope)}`, margin, y); y += 5;
  if (filterDescription) {
    const lines = doc.splitTextToSize(`Filtros: ${filterDescription}`, contentW) as string[];
    doc.text(lines, margin, y); y += lines.length * 5;
  }
  y += 4;

  // ---- Group computation ----
  const grouped = groupBy(regs, r => normalizeKey(gField.getValue(r)));
  const sortedGroups = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length);

  const totalCount = regs.length;
  const totalApproved = regs.filter(r => r.payment_status === "approved").length;
  const totalRevenue = totalApproved * event.unit_price_cents;
  const totalPotential = totalCount * event.unit_price_cents;

  function ensureSpace(needed: number) {
    if (y + needed > pageH - 16) {
      doc.addPage();
      y = 20;
    }
  }

  // ---- Totals summary box ----
  ensureSpace(28);
  doc.setFillColor(245, 247, 252);
  doc.roundedRect(margin, y, contentW, 22, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text("Totais", margin + 4, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...dark);
  doc.text(`Inscritos no escopo: ${totalCount}`, margin + 4, y + 12);
  doc.text(`Pagos: ${totalApproved}`, margin + 4, y + 17);
  doc.text(`Receita confirmada: ${fmtCurrency(totalRevenue)}`, pageW / 2, y + 12);
  doc.text(`Receita potencial: ${fmtCurrency(totalPotential)}`, pageW / 2, y + 17);
  y += 28;

  // ---- Section: per-group breakdown ----
  ensureSpace(10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...navy);
  doc.text(`Distribuição por ${gField.label}`, margin, y); y += 7;

  for (const [groupKey, items] of sortedGroups) {
    ensureSpace(10);
    const groupApproved = items.filter(r => r.payment_status === "approved").length;
    const groupRevenue = groupApproved * event.unit_price_cents;
    const pct = totalCount > 0 ? ((items.length / totalCount) * 100).toFixed(1) : "0";

    // Group header bar
    doc.setFillColor(...accent);
    doc.rect(margin, y - 4, 2, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...navy);
    doc.text(`${gField.label}: ${groupKey}`, margin + 5, y);
    const right = `${items.length} (${pct}%) — ${fmtCurrency(groupRevenue)}`;
    doc.text(right, pageW - margin, y, { align: "right" });
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    doc.text(`Pagos: ${groupApproved} de ${items.length}`, margin + 5, y);
    y += 5;

    if (sgField) {
      const sub = groupBy(items, r => normalizeKey(sgField.getValue(r)));
      const sortedSub = [...sub.entries()].sort((a, b) => b[1].length - a[1].length);
      for (const [subKey, subItems] of sortedSub) {
        ensureSpace(6);
        const subApproved = subItems.filter(r => r.payment_status === "approved").length;
        const subRevenue = subApproved * event.unit_price_cents;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...dark);
        doc.text(`• ${sgField.label}: ${subKey}`, margin + 8, y);
        doc.text(`${subItems.length} (pagos: ${subApproved}) — ${fmtCurrency(subRevenue)}`, pageW - margin, y, { align: "right" });
        y += 5;
      }
    }

    // Light separator
    doc.setDrawColor(220, 220, 225);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageW - margin, y);
    y += 4;
  }

  // ---- Final summary table ----
  y += 4;
  ensureSpace(14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...navy);
  doc.text("Resumo", margin, y); y += 6;

  doc.setFillColor(240, 242, 248);
  doc.rect(margin, y - 4, contentW, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...navy);
  doc.text(gField.label, margin + 2, y);
  doc.text("Inscritos", margin + contentW * 0.55, y, { align: "right" });
  doc.text("Pagos", margin + contentW * 0.75, y, { align: "right" });
  doc.text("Receita", pageW - margin - 2, y, { align: "right" });
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...dark);
  for (const [groupKey, items] of sortedGroups) {
    ensureSpace(6);
    const groupApproved = items.filter(r => r.payment_status === "approved").length;
    const groupRevenue = groupApproved * event.unit_price_cents;
    doc.text(groupKey.length > 50 ? groupKey.substring(0, 48) + "…" : groupKey, margin + 2, y);
    doc.text(String(items.length), margin + contentW * 0.55, y, { align: "right" });
    doc.text(String(groupApproved), margin + contentW * 0.75, y, { align: "right" });
    doc.text(fmtCurrency(groupRevenue), pageW - margin - 2, y, { align: "right" });
    doc.setDrawColor(225, 225, 230);
    doc.setLineWidth(0.1);
    doc.line(margin, y + 2, pageW - margin, y + 2);
    y += 5;
  }

  // Total row
  ensureSpace(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...navy);
  doc.text("Total", margin + 2, y);
  doc.text(String(totalCount), margin + contentW * 0.55, y, { align: "right" });
  doc.text(String(totalApproved), margin + contentW * 0.75, y, { align: "right" });
  doc.text(fmtCurrency(totalRevenue), pageW - margin - 2, y, { align: "right" });
  y += 6;

  // ---- Footer ----
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(...muted);
    doc.text(`Página ${p} de ${pageCount}`, pageW / 2, pageH - 8, { align: "center" });
    doc.text(`Relatório quantitativo: ${event.title}`, margin, pageH - 8);
  }

  return doc;
}
