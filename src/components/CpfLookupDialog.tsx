import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatCentsToBRL, formatCPF, isValidCPF } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar, MapPin, Download, CreditCard } from "lucide-react";
import PaymentProofUpload from "@/components/PaymentProofUpload";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

interface RegistrationWithEvent {
  id: string;
  registration_code: string;
  full_name: string;
  email: string;
  cpf: string;
  registration_status: string;
  payment_status: string;
  qr_token: string | null;
  checkin_status: string;
  order_id: string;
  event_id: string;
  events: {
    title: string;
    slug: string;
    status: string;
    start_date: string;
    end_date: string;
    start_time: string | null;
    end_time: string | null;
    location_name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    workload_hours: number | null;
  };
}

interface CertificateInfo {
  certificate_code: string;
  validation_hash: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CpfLookupDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();

  const [cpfInput, setCpfInput] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [registrations, setRegistrations] = useState<RegistrationWithEvent[] | null>(null);
  const [selectedReg, setSelectedReg] = useState<RegistrationWithEvent | null>(null);
  const [certByRegId, setCertByRegId] = useState<Record<string, CertificateInfo>>({});
  const [downloadingCertId, setDownloadingCertId] = useState<string | null>(null);

  const [splitDialogReg, setSplitDialogReg] = useState<RegistrationWithEvent | null>(null);
  const [splitOrder, setSplitOrder] = useState<{ purchase_type: string; total_price_cents: number; participants_count: number; payment_link: string | null; unit_price_cents: number } | null>(null);
  const [splitPreview, setSplitPreview] = useState<{ remaining_count: number; remaining_total_cents: number; remaining_participants: { id: string; name: string; cpf_masked: string }[] } | null>(null);
  const [splitPreviewLoading, setSplitPreviewLoading] = useState(false);
  const [splitLoading, setSplitLoading] = useState<"individual" | "batch_remaining" | null>(null);

  async function handleCpfLookup() {
    const digits = cpfInput.replace(/\D/g, "");

    if (!digits) {
      toast.error("Digite seu CPF");
      return;
    }
    if (digits.length < 11) {
      toast.error("CPF incompleto. Digite os 11 dígitos.");
      return;
    }
    if (!isValidCPF(digits)) {
      toast.error("CPF inválido. Verifique os dígitos.");
      return;
    }

    setLookupLoading(true);
    setRegistrations(null);
    setSelectedReg(null);

    try {
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        await fetch(
          `https://${projectId}.supabase.co/functions/v1/reconcile-payment`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ cpf: digits }),
          }
        );
      } catch (e) {
        console.warn("Reconciliação prévia falhou (segue normalmente):", e);
      }

      const { data, error } = await supabase
        .from("registrations")
        .select("id, registration_code, full_name, email, cpf, registration_status, payment_status, qr_token, checkin_status, order_id, event_id, events(title, slug, status, start_date, end_date, start_time, end_time, location_name, address, city, state, workload_hours)")
        .eq("cpf", digits)
        .in("registration_status", ["confirmed", "pending_payment"]);

      if (error) {
        console.error("Erro ao consultar inscrições:", error);
        toast.error("Erro ao consultar. Tente novamente em instantes.");
        setRegistrations([]);
        return;
      }

      const safeRegs = ((data || []) as unknown as RegistrationWithEvent[]).filter((r) => {
        if (!r.events) {
          console.warn("Registro sem evento associado:", r.id);
          return false;
        }
        return true;
      });

      setRegistrations(safeRegs);

      const regIds = safeRegs.map((r) => r.id);
      if (regIds.length > 0) {
        const { data: certs } = await supabase
          .from("certificates")
          .select("registration_id, certificate_code, validation_hash")
          .in("registration_id", regIds);
        const map: Record<string, CertificateInfo> = {};
        (certs || []).forEach((c: any) => {
          map[c.registration_id] = { certificate_code: c.certificate_code, validation_hash: c.validation_hash };
        });
        setCertByRegId(map);
      } else {
        setCertByRegId({});
      }
    } catch (err) {
      console.error("Falha inesperada na consulta:", err);
      toast.error("Falha de conexão. Verifique sua internet e tente novamente.");
      setRegistrations([]);
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleSplitPayment(mode: "individual" | "batch_remaining") {
    if (!splitDialogReg) return;
    setSplitLoading(mode);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/split-batch-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ registration_id: splitDialogReg.id, mode }),
        }
      );
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || "Não foi possível gerar o pagamento.");
        setSplitLoading(null);
        return;
      }
      if (result.payment_link) {
        window.location.href = result.payment_link;
      } else {
        toast.error("Pagamento gerado, mas sem link disponível. Contate o suporte.");
        setSplitLoading(null);
      }
    } catch (err) {
      console.error("Falha ao gerar split:", err);
      toast.error("Falha de conexão. Tente novamente.");
      setSplitLoading(null);
    }
  }

  async function handleDownloadCertificate(reg: RegistrationWithEvent) {
    const cert = certByRegId[reg.id];
    if (!cert) return;
    setDownloadingCertId(reg.id);
    try {
      const { data: template } = await supabase
        .from("certificate_templates")
        .select("background_url, field_positions")
        .eq("event_id", reg.event_id)
        .maybeSingle();

      const backgroundUrl = (template as any)?.background_url as string | null | undefined;
      const fieldPositions = ((template as any)?.field_positions as any[] | undefined) || [];

      if (!backgroundUrl) {
        toast.info("Certificado em preparação. Tente novamente em breve.");
        return;
      }

      const { generateCertificatePdf } = await import("@/lib/certificatePdf");
      const formatBR = (d: string) =>
        new Date(d + "T12:00:00").toLocaleDateString("pt-BR");

      const doc = await generateCertificatePdf({
        backgroundUrl,
        fieldPositions,
        participantName: reg.full_name,
        eventTitle: reg.events.title,
        startDate: reg.events.start_date ? formatBR(reg.events.start_date) : "",
        endDate: reg.events.end_date ? formatBR(reg.events.end_date) : "",
        workloadHours: reg.events.workload_hours,
        certificateCode: cert.certificate_code,
        validationHash: cert.validation_hash,
      });
      doc.save(`certificado-${reg.full_name.replace(/\s+/g, "_")}.pdf`);
    } catch (err) {
      console.error("Erro ao baixar certificado:", err);
      toast.error("Erro ao gerar PDF do certificado.");
    } finally {
      setDownloadingCertId(null);
    }
  }

  async function handleDownloadCredential(reg: RegistrationWithEvent) {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: [105, 148] });

    const pw = doc.internal.pageSize.getWidth();
    const margin = 10;
    const maxW = pw - margin * 2;
    let y = 16;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    const titleLines: string[] = doc.splitTextToSize(reg.events.title, maxW);
    doc.text(titleLines, pw / 2, y, { align: "center" });
    y += titleLines.length * 6 + 4;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const dateStr = new Date(reg.events.start_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
    let infoLine = dateStr;
    if (reg.events.start_time) {
      const startT = reg.events.start_time.slice(0, 5);
      const endT = reg.events.end_time ? reg.events.end_time.slice(0, 5) : "";
      infoLine += `  •  ${startT}${endT ? ` – ${endT}` : ""}`;
    }
    doc.text(infoLine, pw / 2, y, { align: "center" });
    y += 5;

    if (reg.events.location_name) {
      let loc = reg.events.location_name.trim();
      if (reg.events.city) loc += `, ${reg.events.city.trim()}`;
      if (reg.events.state) loc += ` – ${reg.events.state.trim()}`;
      const locLines: string[] = doc.splitTextToSize(loc, maxW);
      doc.text(locLines, pw / 2, y, { align: "center" });
      y += locLines.length * 4 + 2;
    }

    y += 3;
    doc.setDrawColor(180);
    doc.line(margin + 10, y, pw - margin - 10, y);
    y += 7;

    doc.setFontSize(10);
    const isPaid = reg.payment_status === "approved" || reg.registration_status === "confirmed";
    const fields = [
      ["Nome", reg.full_name],
      ["E-mail", reg.email],
      ["Código", reg.registration_code],
      ["Status", isPaid ? "Confirmada" : "Pendente"],
    ];
    for (const [label, value] of fields) {
      doc.setFont("helvetica", "bold");
      const labelText = `${label}: `;
      doc.text(labelText, margin + 5, y);
      doc.setFont("helvetica", "normal");
      const labelW = doc.getTextWidth(labelText);
      const valueMaxW = maxW - labelW - 5;
      const valueLines: string[] = doc.splitTextToSize(value, valueMaxW);
      doc.text(valueLines, margin + 5 + labelW, y);
      y += valueLines.length * 5 + 2;
    }

    if (reg.qr_token) {
      y += 4;
      const svgEl = document.getElementById("credential-qr");
      if (svgEl) {
        const svgData = new XMLSerializer().serializeToString(svgEl);
        const img = new Image();
        const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(svgBlob);
        img.onload = () => {
          const qrCanvas = document.createElement("canvas");
          qrCanvas.width = 360;
          qrCanvas.height = 360;
          const ctx = qrCanvas.getContext("2d")!;
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, 360, 360);
          ctx.drawImage(img, 0, 0, 360, 360);
          URL.revokeObjectURL(url);

          const qrDataUrl = qrCanvas.toDataURL("image/png");
          const qrSize = 35;
          doc.addImage(qrDataUrl, "PNG", (pw - qrSize) / 2, y, qrSize, qrSize);
          y += qrSize + 4;
          doc.setFontSize(7);
          doc.text("Apresente este QR Code no dia do evento para check-in.", pw / 2, y, { align: "center" });

          doc.save(`credencial-${reg.registration_code}.pdf`);
        };
        img.src = url;
        return;
      }
    }

    doc.save(`credencial-${reg.registration_code}.pdf`);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setRegistrations(null); setSelectedReg(null); setCpfInput(""); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Consultar Inscrições</DialogTitle>
          </DialogHeader>

          {!selectedReg ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Digite seu CPF para consultar suas inscrições.</p>
              <div className="flex gap-2">
                <Input
                  placeholder="000.000.000-00"
                  value={cpfInput}
                  onChange={(e) => setCpfInput(formatCPF(e.target.value))}
                  onKeyDown={(e) => e.key === "Enter" && handleCpfLookup()}
                />
                <Button onClick={handleCpfLookup} disabled={lookupLoading}>
                  {lookupLoading ? "Buscando..." : "Buscar"}
                </Button>
              </div>

              {registrations !== null && registrations.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma inscrição encontrada para este CPF.</p>
              )}

              {registrations && registrations.length > 0 && (
                <div className="space-y-3">
                  {registrations.map((r) => (
                    <Card
                      key={r.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => setSelectedReg(r)}
                    >
                      <CardContent className="p-4">
                        <p className="font-semibold text-foreground">{r.events.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(r.events.start_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}
                        </p>
                        <div className="mt-1 flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">
                            Código: {r.registration_code} · Status:{" "}
                            <span className={(r.payment_status === "approved" || r.registration_status === "confirmed") ? "text-green-600 font-medium" : "text-amber-600 font-medium"}>
                              {(r.payment_status === "approved" || r.registration_status === "confirmed") ? "Confirmada" : "Pendente"}
                            </span>
                          </p>
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {r.payment_status !== "approved" && r.registration_status !== "confirmed" && (
                            <Button
                              size="sm"
                              variant="default"
                              className="gap-1 text-xs gradient-gold text-white shadow-gold hover:opacity-90"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  try {
                                    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
                                    const recRes = await fetch(
                                      `https://${projectId}.supabase.co/functions/v1/reconcile-payment`,
                                      {
                                        method: "POST",
                                        headers: {
                                          "Content-Type": "application/json",
                                          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                                        },
                                        body: JSON.stringify({ order_id: r.order_id }),
                                      }
                                    );
                                    const recData = await recRes.json().catch(() => ({}));
                                    if (recData?.approved > 0) {
                                      toast.success("Esta inscrição já foi paga e está confirmada.");
                                      await handleCpfLookup();
                                      return;
                                    }
                                  } catch (e2) {
                                    console.warn("Reconciliação falhou; segue tentando o pagamento.", e2);
                                  }

                                  const { data: order, error } = await supabase
                                    .from("orders")
                                    .select("payment_link, payment_status, order_code, purchase_type, total_price_cents, participants_count, unit_price_cents")
                                    .eq("id", r.order_id)
                                    .maybeSingle();
                                  if (error || !order) {
                                    console.error("Erro ao buscar pedido:", error);
                                    toast.error("Não foi possível abrir o pagamento. Refazendo a inscrição...");
                                    navigate(`/evento/${(r.events as any).slug}/inscricao`);
                                    return;
                                  }
                                  if (order.payment_status === "approved") {
                                    toast.success("Pagamento já confirmado.");
                                    await handleCpfLookup();
                                    return;
                                  }
                                  if (order.purchase_type === "batch") {
                                    setSplitOrder({
                                      purchase_type: order.purchase_type,
                                      total_price_cents: order.total_price_cents,
                                      participants_count: order.participants_count,
                                      payment_link: order.payment_link,
                                      unit_price_cents: order.unit_price_cents,
                                    });
                                    setSplitDialogReg(r);
                                    setSplitPreview(null);
                                    setSplitPreviewLoading(true);
                                    try {
                                      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
                                      const prevRes = await fetch(
                                        `https://${projectId}.supabase.co/functions/v1/split-batch-payment`,
                                        {
                                          method: "POST",
                                          headers: {
                                            "Content-Type": "application/json",
                                            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                                          },
                                          body: JSON.stringify({ registration_id: r.id, mode: "preview" }),
                                        }
                                      );
                                      const prev = await prevRes.json();
                                      if (prevRes.ok) {
                                        setSplitPreview({
                                          remaining_count: prev.remaining_count,
                                          remaining_total_cents: prev.remaining_total_cents,
                                          remaining_participants: prev.remaining_participants || [],
                                        });
                                      }
                                    } catch (err) {
                                      console.error("Falha ao carregar preview do lote:", err);
                                    } finally {
                                      setSplitPreviewLoading(false);
                                    }
                                    return;
                                  }
                                  if (order.payment_link) {
                                    window.location.href = order.payment_link;
                                    return;
                                  }
                                  try {
                                    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
                                    const regenRes = await fetch(
                                      `https://${projectId}.supabase.co/functions/v1/create-checkout`,
                                      {
                                        method: "POST",
                                        headers: {
                                          "Content-Type": "application/json",
                                          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                                        },
                                        body: JSON.stringify({ regenerate_for_order_id: r.order_id }),
                                      }
                                    );
                                    const regenData = await regenRes.json().catch(() => ({}));
                                    if (regenRes.ok && regenData?.payment_link) {
                                      window.location.href = regenData.payment_link;
                                      return;
                                    }
                                    toast.error(regenData?.error || "Não foi possível gerar o link de pagamento. Tente novamente em instantes.");
                                  } catch (err2) {
                                    console.error("Falha ao regenerar link de pagamento:", err2);
                                    toast.error("Falha de conexão ao gerar link de pagamento. Tente novamente.");
                                  }
                                } catch (err) {
                                  console.error("Falha ao abrir pagamento:", err);
                                  toast.error("Falha de conexão. Tente novamente.");
                                }
                              }}
                            >
                              <CreditCard className="h-3 w-3" /> Pagar
                            </Button>
                          )}
                          {r.payment_status !== "approved" && r.registration_status !== "confirmed" && (
                            <PaymentProofUpload
                              orderId={r.order_id}
                              cpf={r.cpf}
                              orderCode={r.registration_code}
                              onSubmitted={handleCpfLookup}
                            />
                          )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setSelectedReg(null)} className="gap-1 text-muted-foreground">
                ← Voltar
              </Button>

              <Card className="border-2 border-primary/20">
                <CardContent className="p-6 space-y-4">
                  <div className="text-center border-b border-border pb-4">
                    <h3 className="font-serif text-xl font-bold text-foreground">{selectedReg.events.title}</h3>
                    <div className="mt-2 flex flex-wrap justify-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(selectedReg.events.start_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}
                      </span>
                      {selectedReg.events.start_time && (
                        <span>{selectedReg.events.start_time}{selectedReg.events.end_time ? ` - ${selectedReg.events.end_time}` : ""}</span>
                      )}
                    </div>
                    {selectedReg.events.location_name && (
                      <p className="mt-1 flex items-center justify-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" /> {selectedReg.events.location_name}
                        {selectedReg.events.city && `, ${selectedReg.events.city}`}
                        {selectedReg.events.state && ` - ${selectedReg.events.state}`}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1 text-sm">
                    <p><span className="font-medium text-foreground">Nome:</span> {selectedReg.full_name}</p>
                    <p><span className="font-medium text-foreground">E-mail:</span> {selectedReg.email}</p>
                    <p><span className="font-medium text-foreground">Código:</span> {selectedReg.registration_code}</p>
                    <p>
                      <span className="font-medium text-foreground">Status:</span>{" "}
                      <span className={(selectedReg.payment_status === "approved" || selectedReg.registration_status === "confirmed") ? "text-green-600 font-medium" : "text-amber-600 font-medium"}>
                        {(selectedReg.payment_status === "approved" || selectedReg.registration_status === "confirmed") ? "Confirmada" : "Pendente"}
                      </span>
                    </p>
                  </div>

                  {selectedReg.qr_token && (
                    <div className="flex flex-col items-center pt-2">
                      <div className="rounded-xl border-4 border-primary/10 bg-card p-4">
                        <QRCodeSVG value={selectedReg.qr_token} size={180} level="H" id="credential-qr" />
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground text-center">
                        Apresente este QR Code no dia do evento para check-in.
                      </p>
                    </div>
                  )}

                  {!selectedReg.qr_token && selectedReg.payment_status !== "approved" && selectedReg.registration_status !== "confirmed" && (
                    <div className="flex flex-col items-center gap-3 pt-2">
                      <p className="text-center text-sm text-amber-600">
                        O QR Code será gerado após a confirmação do pagamento.
                      </p>
                      <Button
                        className="gap-2 gradient-gold text-white shadow-gold hover:opacity-90"
                        onClick={async () => {
                          try {
                            const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
                            const recRes = await fetch(
                              `https://${projectId}.supabase.co/functions/v1/reconcile-payment`,
                              {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                                },
                                body: JSON.stringify({ order_id: selectedReg.order_id }),
                              }
                            );
                            const recData = await recRes.json().catch(() => ({}));
                            if (recData?.approved > 0) {
                              toast.success("Esta inscrição já foi paga e está confirmada.");
                              await handleCpfLookup();
                              setSelectedReg(null);
                              return;
                            }
                          } catch (e) {
                            console.warn("Reconciliação falhou:", e);
                          }

                          const { data: order } = await supabase
                            .from("orders")
                            .select("payment_link, payment_status, order_code")
                            .eq("id", selectedReg.order_id)
                            .single();
                          if (order?.payment_status === "approved") {
                            toast.success("Pagamento já confirmado.");
                            await handleCpfLookup();
                            setSelectedReg(null);
                            return;
                          }
                          if (order?.payment_link) {
                            window.location.href = order.payment_link;
                          } else {
                            navigate(`/evento/${(selectedReg.events as any).slug}/inscricao`);
                          }
                        }}
                      >
                        <CreditCard className="h-4 w-4" /> Efetuar pagamento
                      </Button>
                    </div>
                  )}

                  <div className="flex flex-wrap justify-center gap-3 pt-2">
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => handleDownloadCredential(selectedReg)}
                    >
                      <Download className="h-4 w-4" /> Baixar Credencial
                    </Button>
                    {certByRegId[selectedReg.id] && (
                      <Button
                        className="gap-2 gradient-gold text-white shadow-gold hover:opacity-90"
                        onClick={() => handleDownloadCertificate(selectedReg)}
                        disabled={downloadingCertId === selectedReg.id}
                      >
                        <Download className="h-4 w-4" />
                        {downloadingCertId === selectedReg.id ? "Gerando..." : "Baixar Certificado"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={splitDialogReg !== null} onOpenChange={(o) => { if (!o) { setSplitDialogReg(null); setSplitOrder(null); setSplitLoading(null); setSplitPreview(null); setSplitPreviewLoading(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Como deseja pagar?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta inscrição faz parte de um lote pendente. Escolha como deseja prosseguir:
          </p>

          {splitPreviewLoading && (
            <p className="text-xs text-muted-foreground italic">Calculando valor atualizado do lote...</p>
          )}

          {splitPreview && splitPreview.remaining_count > 0 && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <p className="text-xs font-semibold text-foreground mb-1">
                Pendentes neste lote ({splitPreview.remaining_count}):
              </p>
              <ul className="text-xs text-muted-foreground space-y-0.5 max-h-32 overflow-y-auto">
                {splitPreview.remaining_participants.map((p) => (
                  <li key={p.id}>• {p.name} <span className="opacity-60">({p.cpf_masked})</span></li>
                ))}
              </ul>
            </div>
          )}

          {splitOrder && (
            <div className="mt-2 space-y-3">
              <button
                type="button"
                disabled={splitLoading !== null || splitPreviewLoading}
                onClick={() => handleSplitPayment("individual")}
                className="w-full rounded-lg border border-border bg-card p-4 text-left transition-all hover:border-accent hover:shadow-md disabled:opacity-60"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">Pagar só a minha inscrição</span>
                  <span className="font-serif text-lg font-bold text-foreground">{formatCentsToBRL(splitOrder.unit_price_cents)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {splitLoading === "individual" ? "Gerando link individual..." : "Sua inscrição é separada do lote e paga só por você. Os demais continuam pendentes."}
                </p>
              </button>
              <button
                type="button"
                disabled={splitLoading !== null || splitPreviewLoading || (splitPreview?.remaining_count ?? 0) === 0}
                onClick={() => handleSplitPayment("batch_remaining")}
                className="w-full rounded-lg border border-border bg-card p-4 text-left transition-all hover:border-accent hover:shadow-md disabled:opacity-60"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">Pagar o lote completo</span>
                  <span className="font-serif text-lg font-bold text-foreground">
                    {formatCentsToBRL(splitPreview?.remaining_total_cents ?? splitOrder.total_price_cents)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {splitLoading === "batch_remaining"
                    ? "Atualizando link do lote..."
                    : `Paga as ${splitPreview?.remaining_count ?? splitOrder.participants_count} inscrição(ões) que ainda estão pendentes neste lote (valor recalculado).`}
                </p>
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
