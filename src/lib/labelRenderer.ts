import QRCode from "qrcode";
import type { LabelTemplate, LabelElement } from "./labelTypes";
import { resolveValue } from "./labelTypes";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c] as string));
}

async function elementHtml(el: LabelElement, reg: Record<string, any>): Promise<string> {
  const style = `position:absolute;left:${el.x_mm}mm;top:${el.y_mm}mm;width:${el.width_mm}mm;height:${el.height_mm}mm;overflow:hidden;`;

  if (el.type === "qrcode") {
    const value = resolveValue(el.source || "qr_token", reg);
    if (!value) {
      return `<div style="${style}"></div>`;
    }
    // Generate SVG with margin 0; size will be controlled by container CSS
    const svg = await QRCode.toString(value, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
    });
    // Force SVG to fill container
    const inlined = svg.replace(
      "<svg ",
      '<svg preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block;" '
    );
    return `<div style="${style}">${inlined}</div>`;
  }

  const text = resolveValue(el.source, reg, el.static_text);
  const fontSize = el.font_size_pt ?? 10;
  const fontWeight = el.font_weight ?? "normal";
  const align = el.align ?? "left";
  const textStyle =
    `font-family:'Source Sans 3',Arial,sans-serif;` +
    `font-size:${fontSize}pt;font-weight:${fontWeight};text-align:${align};` +
    `line-height:1.15;color:#000;display:flex;align-items:center;` +
    `justify-content:${align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start"};` +
    `width:100%;height:100%;word-break:break-word;white-space:normal;`;
  return `<div style="${style}"><div style="${textStyle}">${escapeHtml(text)}</div></div>`;
}

export async function printLabels(
  registrations: Record<string, any>[],
  template: LabelTemplate
): Promise<void> {
  if (!registrations.length) return;

  const w = template.width_mm;
  const h = template.height_mm;

  const labelsHtml: string[] = [];
  for (let i = 0; i < registrations.length; i++) {
    const reg = registrations[i];
    const parts = await Promise.all((template.elements || []).map((el) => elementHtml(el, reg)));
    const isLast = i === registrations.length - 1;
    labelsHtml.push(
      `<div class="label" style="position:relative;width:${w}mm;height:${h}mm;${
        isLast ? "" : "page-break-after:always;"
      }overflow:hidden;">${parts.join("")}</div>`
    );
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Etiquetas</title>
<style>
  @page { size: ${w}mm ${h}mm; margin: 0; }
  html, body { margin:0; padding:0; background:#fff; }
  body { font-family:'Source Sans 3',Arial,sans-serif; }
  .label { box-sizing:border-box; }
  @media screen {
    body { padding:20px; background:#eee; }
    .label { background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.2); margin-bottom:8px; }
  }
</style>
</head><body>
${labelsHtml.join("\n")}
<script>
  window.addEventListener('load', function(){
    setTimeout(function(){ window.print(); }, 200);
  });
  window.addEventListener('afterprint', function(){ window.close(); });
</script>
</body></html>`;

  const win = window.open("", "_blank", "width=800,height=600");
  if (!win) {
    alert("Permita pop-ups para imprimir as etiquetas.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
