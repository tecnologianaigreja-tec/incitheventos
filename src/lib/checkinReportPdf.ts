import jsPDF from "jspdf";
import { format } from "date-fns";
import type { RegistrationData } from "@/lib/types";
import type { ActiveFilter } from "@/components/DynamicFieldFilters";

export interface CheckinReportRow extends RegistrationData {
  /** Effective check-in time for the selected day (from checkin_days.checked_at) */
  day_checked_at: string;
  /** Per-day presence map: { 'YYYY-MM-DD': true } */
  presence_by_day?: Record<string, boolean>;
}

export interface CheckinReportOptions {
  eventTitle: string;
  eventStartDate: string; // ISO date
  eventEndDate: string;   // ISO date
  selectedDay: string;    // ISO date (YYYY-MM-DD)
  eventDays: string[];    // all days in the event
  filters: ActiveFilter[];
  rows: CheckinReportRow[]; // sorted ascending by day_checked_at
  slug: string;
}

function fmtDate(iso: string) {
  try { return format(new Date(iso + "T12:00:00"), "dd/MM/yyyy"); } catch { return iso; }
}
function fmtTime(iso: string) {
  try { return format(new Date(iso), "HH:mm:ss"); } catch { return iso; }
}

export function generateCheckinReportPdf(options: CheckinReportOptions): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const pageH = 297;
  const margin = 12;
  let y = margin;

  const isMultiDay = options.eventDays.length > 1;

  // ---- Header ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 58, 95);
  doc.text("Relatório de Participantes Presentes", margin, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text(options.eventTitle, margin, y);
  y += 5;

  const period = options.eventStartDate === options.eventEndDate
    ? fmtDate(options.eventStartDate)
    : `${fmtDate(options.eventStartDate)} a ${fmtDate(options.eventEndDate)}`;
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(`Período do evento: ${period}`, margin, y); y += 4;
  doc.text(`Dia do check-in: ${fmtDate(options.selectedDay)}`, margin, y); y += 4;
  doc.text(`Total de presentes: ${options.rows.length}`, margin, y); y += 4;
  if (options.filters.length > 0) {
    const f = options.filters
      .map(ff => `${ff.fieldLabel}: ${ff.values ? ff.values.join("/") : ff.value}`)
      .join(" • ");
    const lines = doc.splitTextToSize(`Filtros: ${f}`, pageW - margin * 2) as string[];
    doc.text(lines, margin, y); y += lines.length * 4;
  }
  doc.text(`Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, margin, y); y += 6;

  // ---- Table header ----
  const dayColumnsFit = isMultiDay && options.eventDays.length <= 5;

  // Column widths
  const colNum = 10;
  const colTime = 22;
  const colDayWidth = dayColumnsFit ? 10 : 0;
  const dayColsTotal = dayColumnsFit ? options.eventDays.length * colDayWidth : 0;
  const remaining = pageW - margin * 2 - colNum - colTime - dayColsTotal;
  const colName = Math.floor(remaining * 0.45);
  const colEmail = remaining - colName;

  function drawHeader() {
    doc.setFillColor(30, 58, 95);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.rect(margin, y, pageW - margin * 2, 7, "F");
    let x = margin + 2;
    doc.text("#", x, y + 5); x += colNum;
    doc.text("Nome", x, y + 5); x += colName;
    doc.text("E-mail", x, y + 5); x += colEmail;
    doc.text("Check-in", x, y + 5); x += colTime;
    if (dayColumnsFit) {
      options.eventDays.forEach((d, i) => {
        doc.text(`D${i + 1}`, x + colDayWidth / 2, y + 5, { align: "center" });
        x += colDayWidth;
      });
    }
    y += 7;
  }

  drawHeader();

  doc.setFont("helvetica", "normal");
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(8);

  options.rows.forEach((row, i) => {
    if (y > pageH - margin - 12) {
      doc.addPage();
      y = margin;
      drawHeader();
      doc.setFont("helvetica", "normal");
      doc.setTextColor(40, 40, 40);
      doc.setFontSize(8);
    }
    // Zebra stripe
    if (i % 2 === 0) {
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, y, pageW - margin * 2, 6, "F");
    }
    let x = margin + 2;
    doc.text(String(i + 1), x, y + 4); x += colNum;
    const nameLines = doc.splitTextToSize(row.full_name || "", colName - 2) as string[];
    doc.text(nameLines[0] || "", x, y + 4); x += colName;
    const emailLines = doc.splitTextToSize(row.email || "", colEmail - 2) as string[];
    doc.text(emailLines[0] || "", x, y + 4); x += colEmail;
    doc.text(row.day_checked_at ? fmtTime(row.day_checked_at) : "—", x, y + 4); x += colTime;
    if (dayColumnsFit) {
      options.eventDays.forEach(d => {
        const present = row.presence_by_day?.[d];
        doc.setTextColor(present ? 0 : 180, present ? 130 : 0, 0);
        doc.text(present ? "✓" : "—", x + colDayWidth / 2, y + 4, { align: "center" });
        x += colDayWidth;
      });
      doc.setTextColor(40, 40, 40);
    }
    y += 6;
  });

  // For multi-day events that don't fit columns, append a per-row summary section
  if (isMultiDay && !dayColumnsFit) {
    if (y > pageH - margin - 30) { doc.addPage(); y = margin; }
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 58, 95);
    doc.text("Presença por dia", margin, y); y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(40, 40, 40);
    options.rows.forEach((row, i) => {
      if (y > pageH - margin - 6) { doc.addPage(); y = margin; }
      const marks = options.eventDays
        .map((d, idx) => `D${idx + 1}${row.presence_by_day?.[d] ? "✓" : "✗"}`)
        .join("  ");
      const line = `${i + 1}. ${row.full_name}  —  ${marks}`;
      const wrapped = doc.splitTextToSize(line, pageW - margin * 2) as string[];
      doc.text(wrapped, margin, y);
      y += wrapped.length * 4;
    });
  }

  return doc;
}

export function downloadCheckinReport(options: CheckinReportOptions) {
  const doc = generateCheckinReportPdf(options);
  doc.save(`presentes-${options.slug}-dia-${options.selectedDay}.pdf`);
}
