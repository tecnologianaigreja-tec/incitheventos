import jsPDF from "jspdf";
import type { RegistrationData } from "@/lib/types";

interface EventInfo {
  title: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  location_name: string | null;
  city: string | null;
  state: string | null;
  unit_price_cents: number;
  max_participants: number | null;
  workload_hours: number | null;
}

interface ReportOptions {
  event: EventInfo;
  registrations: RegistrationData[];
  filterDescription: string | null;
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("pt-BR");
}

function fmtCurrency(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDateTime(isoStr: string) {
  return new Date(isoStr).toLocaleDateString("pt-BR");
}

/** Group check-ins by date (YYYY-MM-DD) */
function checkinsByDay(regs: RegistrationData[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of regs) {
    if (r.checkin_status === "checked_in" && r.checkin_at) {
      const day = r.checkin_at.substring(0, 10); // YYYY-MM-DD
      map.set(day, (map.get(day) || 0) + 1);
    }
  }
  return map;
}

export function generateEventReportPdf({ event, registrations, filterDescription }: ReportOptions) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const margin = 18;
  const contentW = pageW - margin * 2;
  let y = 20;

  const navy: [number, number, number] = [30, 58, 95];
  const dark: [number, number, number] = [40, 40, 40];
  const muted: [number, number, number] = [120, 120, 120];
  const accent: [number, number, number] = [45, 100, 160];

  // ---- Header ----
  doc.setDrawColor(...navy);
  doc.setLineWidth(1.2);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...navy);
  doc.text("RELATÓRIO DO EVENTO", pageW / 2, y, { align: "center" });
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...muted);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, pageW / 2, y, { align: "center" });
  y += 4;

  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 10;

  // ---- Event Info ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...navy);
  doc.text(event.title, margin, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...dark);

  const eventDetails = [
    `Período: ${fmtDate(event.start_date)} a ${fmtDate(event.end_date)}`,
    event.start_time ? `Horário: ${event.start_time}${event.end_time ? ` às ${event.end_time}` : ""}` : null,
    event.location_name ? `Local: ${event.location_name}` : null,
    event.city ? `Cidade: ${event.city}${event.state ? ` - ${event.state}` : ""}` : null,
    event.workload_hours ? `Carga horária: ${event.workload_hours}h` : null,
    `Valor da inscrição: ${event.unit_price_cents > 0 ? fmtCurrency(event.unit_price_cents) : "Gratuito"}`,
    event.max_participants ? `Vagas: ${event.max_participants}` : null,
  ].filter(Boolean);

  for (const line of eventDetails) {
    doc.text(line!, margin, y);
    y += 5;
  }

  // ---- Filter info ----
  if (filterDescription) {
    y += 3;
    doc.setFillColor(245, 245, 250);
    doc.roundedRect(margin, y - 4, contentW, 10, 2, 2, "F");
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...accent);
    doc.text(`Filtro aplicado: ${filterDescription}`, margin + 4, y + 1);
    y += 12;
  }

  y += 3;

  // Helper to draw section title
  function sectionTitle(title: string) {
    doc.setDrawColor(...accent);
    doc.setFillColor(...accent);
    doc.rect(margin, y - 4, 3, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...navy);
    doc.text(title, margin + 6, y);
    y += 9;
  }

  // Helper to draw metric row
  function metricRow(label: string, value: string, bold = false) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(10);
    doc.setTextColor(...dark);
    doc.text(label, margin + 4, y);
    doc.text(value, pageW - margin - 4, y, { align: "right" });
    y += 6;
  }

  // ---- Registration Metrics ----
  sectionTitle("Inscrições");

  const totalRegs = registrations.length;
  const confirmed = registrations.filter(r => r.registration_status === "confirmed").length;
  const pendingPayment = registrations.filter(r => r.registration_status === "pending_payment").length;
  const canceled = registrations.filter(r => r.registration_status === "canceled").length;
  const invalidated = registrations.filter(r => r.registration_status === "invalidated").length;

  metricRow("Total de inscritos", String(totalRegs), true);
  metricRow("Confirmados", String(confirmed));
  metricRow("Pendentes de pagamento", String(pendingPayment));
  if (canceled > 0) metricRow("Cancelados", String(canceled));
  if (invalidated > 0) metricRow("Invalidados", String(invalidated));

  const individual = registrations.filter(r => r.registration_type === "individual").length;
  const batch = registrations.filter(r => r.registration_type === "batch").length;
  if (batch > 0) {
    y += 2;
    metricRow("Inscrições individuais", String(individual));
    metricRow("Inscrições em lote", String(batch));
  }

  y += 6;

  // ---- Financial Metrics ----
  sectionTitle("Faturamento");

  const approved = registrations.filter(r => r.payment_status === "approved");
  const totalRevenue = approved.length * event.unit_price_cents;
  const pendingRevenue = pendingPayment * event.unit_price_cents;
  const refunded = registrations.filter(r => r.payment_status === "refunded").length;

  metricRow("Receita confirmada", fmtCurrency(totalRevenue), true);
  metricRow("Receita pendente", fmtCurrency(pendingRevenue));
  metricRow("Inscritos pagos", String(approved.length));
  if (refunded > 0) metricRow("Reembolsados", String(refunded));
  if (event.max_participants) {
    const occupancy = ((totalRegs / event.max_participants) * 100).toFixed(1);
    metricRow("Taxa de ocupação", `${occupancy}%`);
  }

  y += 6;

  // ---- Check-in Metrics ----
  sectionTitle("Check-in / Presença");

  const checkedIn = registrations.filter(r => r.checkin_status === "checked_in").length;
  const eligibleForCheckin = confirmed;
  const attendanceRate = eligibleForCheckin > 0 ? ((checkedIn / eligibleForCheckin) * 100).toFixed(1) : "0";

  metricRow("Total com check-in", String(checkedIn), true);
  metricRow("Elegíveis (confirmados)", String(eligibleForCheckin));
  metricRow("Taxa de presença", `${attendanceRate}%`);

  // Per-day breakdown
  const dailyCheckins = checkinsByDay(registrations);
  if (dailyCheckins.size > 0) {
    y += 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...accent);
    doc.text("Presença por dia:", margin + 4, y);
    y += 6;

    const sortedDays = [...dailyCheckins.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [day, count] of sortedDays) {
      const pct = eligibleForCheckin > 0 ? ((count / eligibleForCheckin) * 100).toFixed(1) : "0";
      metricRow(`  ${fmtDateTime(day)}`, `${count} presentes (${pct}%)`);
    }
  }

  // ---- Check page overflow for participant list ----
  y += 10;

  // ---- Participant List ----
  if (y > 240) {
    doc.addPage();
    y = 20;
  }

  sectionTitle("Lista de Inscritos");

  // Table header
  doc.setFillColor(240, 242, 248);
  doc.rect(margin, y - 4, contentW, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...navy);

  const colX = {
    name: margin + 2,
    email: margin + 52,
    cpf: margin + 108,
    payment: margin + 138,
    checkin: margin + 158,
  };

  doc.text("Nome", colX.name, y);
  doc.text("E-mail", colX.email, y);
  doc.text("CPF", colX.cpf, y);
  doc.text("Pagamento", colX.payment, y);
  doc.text("Check-in", colX.checkin, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...dark);

  for (const r of registrations) {
    if (y > 280) {
      doc.addPage();
      y = 20;
      // Repeat header
      doc.setFillColor(240, 242, 248);
      doc.rect(margin, y - 4, contentW, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...navy);
      doc.text("Nome", colX.name, y);
      doc.text("E-mail", colX.email, y);
      doc.text("CPF", colX.cpf, y);
      doc.text("Pagamento", colX.payment, y);
      doc.text("Check-in", colX.checkin, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...dark);
    }

    const name = r.full_name.length > 28 ? r.full_name.substring(0, 26) + "…" : r.full_name;
    const email = r.email.length > 30 ? r.email.substring(0, 28) + "…" : r.email;
    const payLabel = r.payment_status === "approved" ? "Pago" : r.payment_status === "pending" ? "Pendente" : r.payment_status;
    const checkinLabel = r.checkin_status === "checked_in" ? "✓" : "—";

    doc.text(name, colX.name, y);
    doc.text(email, colX.email, y);
    doc.text(r.cpf, colX.cpf, y);
    doc.text(payLabel, colX.payment, y);
    doc.text(checkinLabel, colX.checkin, y);

    // Light separator
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.15);
    doc.line(margin, y + 2, pageW - margin, y + 2);
    y += 5;
  }

  // ---- Footer ----
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(...muted);
    doc.text(`Página ${p} de ${pageCount}`, pageW / 2, 290, { align: "center" });
    doc.text(`Relatório: ${event.title}`, margin, 290);
  }

  return doc;
}
