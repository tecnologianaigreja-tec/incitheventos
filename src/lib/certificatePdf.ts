import jsPDF from "jspdf";

export interface SignatureItem {
  image_url?: string | null;
  name: string;
  title: string;
}

export type FrameStyle = "classic" | "elegant" | "modern" | "minimal";
export type SignaturePosition = "left" | "center" | "right";

interface CertificatePdfOptions {
  logoUrl?: string | null;
  bodyText: string;
  frameStyle: FrameStyle;
  signatures: SignatureItem[];
  signaturePosition: SignaturePosition;
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

function drawFrame(doc: jsPDF, style: FrameStyle, w: number, h: number) {
  switch (style) {
    case "classic": {
      doc.setDrawColor(30, 58, 95);
      doc.setLineWidth(1.5);
      doc.rect(10, 10, w - 20, h - 20);
      doc.setLineWidth(0.5);
      doc.rect(12, 12, w - 24, h - 24);
      break;
    }
    case "elegant": {
      // Double gold border with corner accents
      doc.setDrawColor(180, 150, 60);
      doc.setLineWidth(2);
      doc.rect(8, 8, w - 16, h - 16);
      doc.setDrawColor(180, 150, 60);
      doc.setLineWidth(0.5);
      doc.rect(13, 13, w - 26, h - 26);
      // Corner ornaments
      const cornerLen = 20;
      const corners = [
        [13, 13], [w - 13, 13], [13, h - 13], [w - 13, h - 13],
      ];
      doc.setLineWidth(1.2);
      corners.forEach(([cx, cy], i) => {
        const dx = i % 2 === 0 ? 1 : -1;
        const dy = i < 2 ? 1 : -1;
        doc.line(cx, cy, cx + dx * cornerLen, cy);
        doc.line(cx, cy, cx, cy + dy * cornerLen);
      });
      break;
    }
    case "modern": {
      // Thick left accent + thin border
      doc.setDrawColor(45, 100, 160);
      doc.setFillColor(45, 100, 160);
      doc.rect(8, 8, 5, h - 16, "F");
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.rect(8, 8, w - 16, h - 16);
      // Top accent line
      doc.setDrawColor(45, 100, 160);
      doc.setLineWidth(1.5);
      doc.line(13, 8, w - 8, 8);
      break;
    }
    case "minimal": {
      // Simple thin border with generous margin
      doc.setDrawColor(160, 160, 160);
      doc.setLineWidth(0.3);
      doc.rect(15, 15, w - 30, h - 30);
      break;
    }
  }
}

export async function generateCertificatePdf(options: CertificatePdfOptions): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = 297;
  const pageH = 210;
  const margin = 25;

  // Frame
  drawFrame(doc, options.frameStyle || "classic", pageW, pageH);

  let currentY = 32;

  // Logo
  if (options.logoUrl) {
    try {
      const img = await loadImage(options.logoUrl);
      const maxLogoH = 28;
      const maxLogoW = 75;
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
  doc.setFontSize(26);
  const titleColor: [number, number, number] = options.frameStyle === "elegant" ? [140, 110, 30] : [30, 58, 95];
  doc.setTextColor(...titleColor);
  doc.text("CERTIFICADO", pageW / 2, currentY, { align: "center" });
  currentY += 14;

  // Body text with variable substitution
  let body = options.bodyText;
  body = body.replace(/\{nome\}/g, options.participantName);
  body = body.replace(/\{evento\}/g, options.eventTitle);
  body = body.replace(/\{data_inicio\}/g, options.startDate);
  body = body.replace(/\{data_fim\}/g, options.endDate);
  body = body.replace(/\{carga_horaria\}/g, String(options.workloadHours || "—"));
  body = body.replace(/\{codigo\}/g, options.certificateCode);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(40, 40, 40);
  const textLines = doc.splitTextToSize(body, pageW - margin * 2 - 10);
  doc.text(textLines, pageW / 2, currentY, { align: "center", lineHeightFactor: 1.7 });
  currentY += textLines.length * 7 + 10;

  // Signatures
  const substituteVars = (text: string) => {
    return text
      .replace(/\{nome\}/g, options.participantName)
      .replace(/\{evento\}/g, options.eventTitle)
      .replace(/\{data_inicio\}/g, options.startDate)
      .replace(/\{data_fim\}/g, options.endDate)
      .replace(/\{carga_horaria\}/g, String(options.workloadHours || "—"))
      .replace(/\{codigo\}/g, options.certificateCode);
  };

  const sigs = options.signatures.filter(s => s.name || s.image_url).map(s => ({
    ...s,
    name: substituteVars(s.name),
    title: substituteVars(s.title),
  }));
  if (sigs.length > 0) {
    const sigY = Math.max(currentY + 5, pageH - 60);
    const sigCount = sigs.length;

    // Calculate x positions based on position setting
    let sigXPositions: number[] = [];
    const sigBlockWidth = 80;

    if (options.signaturePosition === "center") {
      const totalWidth = sigCount * sigBlockWidth + (sigCount - 1) * 20;
      const startX = (pageW - totalWidth) / 2 + sigBlockWidth / 2;
      for (let i = 0; i < sigCount; i++) {
        sigXPositions.push(startX + i * (sigBlockWidth + 20));
      }
    } else if (options.signaturePosition === "left") {
      const startX = margin + sigBlockWidth / 2;
      for (let i = 0; i < sigCount; i++) {
        sigXPositions.push(startX + i * (sigBlockWidth + 20));
      }
    } else {
      // right
      const startX = pageW - margin - sigBlockWidth / 2 - (sigCount - 1) * (sigBlockWidth + 20);
      for (let i = 0; i < sigCount; i++) {
        sigXPositions.push(startX + i * (sigBlockWidth + 20));
      }
    }

    for (let i = 0; i < sigCount; i++) {
      const sig = sigs[i];
      const cx = sigXPositions[i];

      // Signature image
      if (sig.image_url) {
        try {
          const sigImg = await loadImage(sig.image_url);
          const sigMaxH = 18;
          const sigMaxW = 55;
          const sigRatio = Math.min(sigMaxW / sigImg.width, sigMaxH / sigImg.height);
          const sigW = sigImg.width * sigRatio;
          const sigH = sigImg.height * sigRatio;
          doc.addImage(sigImg, "PNG", cx - sigW / 2, sigY, sigW, sigH);
        } catch {
          // skip
        }
      }

      // Line
      const lineY = sigY + 22;
      doc.setDrawColor(80, 80, 80);
      doc.setLineWidth(0.3);
      doc.line(cx - 35, lineY, cx + 35, lineY);

      // Name
      if (sig.name) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(40, 40, 40);
        doc.text(sig.name, cx, lineY + 5, { align: "center" });
      }

      // Title
      if (sig.title) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(sig.title, cx, lineY + 9, { align: "center" });
      }
    }
  }

  // Validation code at bottom
  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  doc.text(`Código: ${options.certificateCode} | Validação: ${options.validationHash}`, pageW / 2, pageH - 12, { align: "center" });

  return doc;
}
