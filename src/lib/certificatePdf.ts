import jsPDF from "jspdf";

interface CertificatePdfOptions {
  logoUrl?: string | null;
  bodyText: string;
  signatureImageUrl?: string | null;
  signatureName?: string | null;
  signatureTitle?: string | null;
  // Variables for substitution
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

export async function generateCertificatePdf(options: CertificatePdfOptions): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = 297;
  const pageH = 210;
  const margin = 20;

  // Border
  doc.setDrawColor(30, 58, 95);
  doc.setLineWidth(1.5);
  doc.rect(10, 10, pageW - 20, pageH - 20);
  doc.setLineWidth(0.5);
  doc.rect(12, 12, pageW - 24, pageH - 24);

  let currentY = 30;

  // Logo
  if (options.logoUrl) {
    try {
      const img = await loadImage(options.logoUrl);
      const maxLogoH = 30;
      const maxLogoW = 80;
      const ratio = Math.min(maxLogoW / img.width, maxLogoH / img.height);
      const logoW = img.width * ratio;
      const logoH = img.height * ratio;
      doc.addImage(img, "PNG", (pageW - logoW) / 2, currentY, logoW, logoH);
      currentY += logoH + 10;
    } catch {
      currentY += 5;
    }
  }

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(30, 58, 95);
  doc.text("CERTIFICADO", pageW / 2, currentY, { align: "center" });
  currentY += 15;

  // Body text with variable substitution
  let body = options.bodyText;
  body = body.replace(/\{nome\}/g, options.participantName);
  body = body.replace(/\{evento\}/g, options.eventTitle);
  body = body.replace(/\{data_inicio\}/g, options.startDate);
  body = body.replace(/\{data_fim\}/g, options.endDate);
  body = body.replace(/\{carga_horaria\}/g, String(options.workloadHours || "—"));
  body = body.replace(/\{codigo\}/g, options.certificateCode);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(40, 40, 40);
  const textLines = doc.splitTextToSize(body, pageW - margin * 2 - 20);
  doc.text(textLines, pageW / 2, currentY, { align: "center", lineHeightFactor: 1.6 });
  currentY += textLines.length * 7 + 15;

  // Signature area
  const sigY = Math.max(currentY, pageH - 65);

  if (options.signatureImageUrl) {
    try {
      const sigImg = await loadImage(options.signatureImageUrl);
      const sigMaxH = 20;
      const sigMaxW = 60;
      const sigRatio = Math.min(sigMaxW / sigImg.width, sigMaxH / sigImg.height);
      const sigW = sigImg.width * sigRatio;
      const sigH = sigImg.height * sigRatio;
      doc.addImage(sigImg, "PNG", (pageW - sigW) / 2, sigY, sigW, sigH);
    } catch {
      // skip signature image
    }
  }

  // Signature line
  const lineY = sigY + 25;
  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.3);
  doc.line(pageW / 2 - 40, lineY, pageW / 2 + 40, lineY);

  if (options.signatureName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    doc.text(options.signatureName, pageW / 2, lineY + 5, { align: "center" });
  }

  if (options.signatureTitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(options.signatureTitle, pageW / 2, lineY + 10, { align: "center" });
  }

  // Validation code at bottom
  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  doc.text(`Código: ${options.certificateCode} | Validação: ${options.validationHash}`, pageW / 2, pageH - 14, { align: "center" });

  return doc;
}
