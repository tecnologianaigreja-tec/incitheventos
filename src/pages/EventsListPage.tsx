import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { EventData } from "@/lib/types";
import { formatCentsToBRL, formatCPF, isValidCPF } from "@/lib/constants";
import { getTemplateById } from "@/lib/templates";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Calendar, MapPin, ChevronRight, BookOpen, Search, QrCode, Download, CreditCard } from "lucide-react";
import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

interface SiteSettings {
  header_type: "color" | "banner";
  header_color: string;
  header_title: string;
  header_subtitle: string;
  header_banner_url: string | null;
  footer_text: string;
}

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
  events: {
    title: string;
    slug: string;
    start_date: string;
    end_date: string;
    start_time: string | null;
    end_time: string | null;
    location_name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
  };
}

export default function EventsListPage() {
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const navigate = useNavigate();

  // CPF lookup state
  const [lookupOpen, setLookupOpen] = useState(false);
  const [cpfInput, setCpfInput] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [registrations, setRegistrations] = useState<RegistrationWithEvent[] | null>(null);
  const [selectedReg, setSelectedReg] = useState<RegistrationWithEvent | null>(null);

  useEffect(() => {
    async function load() {
      const [evRes, settingsRes] = await Promise.all([
        supabase
          .from("events")
          .select("*")
          .in("status", ["published"])
          .order("start_date", { ascending: true }),
        supabase
          .from("site_settings")
          .select("*")
          .limit(1)
          .single(),
      ]);
      setEvents((evRes.data || []) as unknown as EventData[]);
      if (settingsRes.data) setSettings(settingsRes.data as unknown as SiteSettings);
      setLoading(false);
    }
    load();
  }, []);

  async function handleCpfLookup() {
    const digits = cpfInput.replace(/\D/g, "");
    if (!isValidCPF(digits)) return;
    setLookupLoading(true);
    setRegistrations(null);
    setSelectedReg(null);

    const { data } = await supabase
      .from("registrations")
      .select("id, registration_code, full_name, email, cpf, registration_status, payment_status, qr_token, checkin_status, order_id, events(title, slug, start_date, end_date, start_time, end_time, location_name, address, city, state)")
      .eq("cpf", digits)
      .in("registration_status", ["confirmed", "pending_payment"]);

    setRegistrations((data || []) as unknown as RegistrationWithEvent[]);
    setLookupLoading(false);
  }

  async function handleDownloadCredential(reg: RegistrationWithEvent) {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: [105, 148] });

    const pw = doc.internal.pageSize.getWidth();
    let y = 20;

    // Title
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(reg.events.title, pw / 2, y, { align: "center" });
    y += 10;

    // Date & location
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const dateStr = new Date(reg.events.start_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
    let infoLine = dateStr;
    if (reg.events.start_time) infoLine += `  ${reg.events.start_time}${reg.events.end_time ? ` - ${reg.events.end_time}` : ""}`;
    doc.text(infoLine, pw / 2, y, { align: "center" });
    y += 6;

    if (reg.events.location_name) {
      let loc = reg.events.location_name;
      if (reg.events.city) loc += `, ${reg.events.city}`;
      if (reg.events.state) loc += ` - ${reg.events.state}`;
      doc.text(loc, pw / 2, y, { align: "center" });
      y += 6;
    }

    // Divider
    y += 4;
    doc.setDrawColor(200);
    doc.line(20, y, pw - 20, y);
    y += 8;

    // Participant info
    doc.setFontSize(11);
    const fields = [
      ["Nome", reg.full_name],
      ["E-mail", reg.email],
      ["Código", reg.registration_code],
      ["Status", reg.payment_status === "approved" ? "Confirmada" : "Pendente"],
    ];
    for (const [label, value] of fields) {
      doc.setFont("helvetica", "bold");
      doc.text(`${label}: `, 20, y);
      doc.setFont("helvetica", "normal");
      doc.text(value, 20 + doc.getTextWidth(`${label}: `), y);
      y += 7;
    }

    // QR Code
    if (reg.qr_token) {
      y += 6;
      const qrCanvas = document.createElement("canvas");
      // Use the QR SVG already in DOM
      const svgEl = document.getElementById("credential-qr");
      if (svgEl) {
        const svgData = new XMLSerializer().serializeToString(svgEl);
        const img = new Image();
        const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(svgBlob);
        img.onload = () => {
          qrCanvas.width = 360;
          qrCanvas.height = 360;
          const ctx = qrCanvas.getContext("2d")!;
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, 360, 360);
          ctx.drawImage(img, 0, 0, 360, 360);
          URL.revokeObjectURL(url);

          const qrDataUrl = qrCanvas.toDataURL("image/png");
          const qrSize = 40;
          doc.addImage(qrDataUrl, "PNG", (pw - qrSize) / 2, y, qrSize, qrSize);
          y += qrSize + 6;
          doc.setFontSize(8);
          doc.text("Apresente este QR Code no dia do evento para check-in.", pw / 2, y, { align: "center" });

          doc.save(`credencial-${reg.registration_code}.pdf`);
        };
        img.src = url;
        return;
      }
    }

    doc.save(`credencial-${reg.registration_code}.pdf`);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // If only one event, show the list page normally (don't redirect)
  // so users can still access the events list and CPF lookup

  const headerTitle = settings?.header_title || "Nossos Eventos";
  const headerSubtitle = settings?.header_subtitle || "Confira os eventos disponíveis e inscreva-se";
  const footerText = settings?.footer_text || "© 2026 INSIT. Todos os direitos reservados.";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* HEADER */}
      {settings?.header_type === "banner" && settings.header_banner_url ? (
        <section
          className="relative flex items-center justify-center px-4 py-20 text-center"
          style={{
            backgroundImage: `url(${settings.header_banner_url})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-foreground/60 backdrop-blur-[2px]" />
          <div className="relative z-10 container mx-auto max-w-4xl">
            <motion.h1
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
              className="mb-3 font-serif text-4xl font-bold text-white md:text-5xl tracking-tight"
            >
              {headerTitle}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }}
              className="text-white/70 text-lg"
            >
              {headerSubtitle}
            </motion.p>
          </div>
        </section>
      ) : (
        <section
          className="relative px-4 py-20 text-center overflow-hidden"
          style={{ backgroundColor: `hsl(${settings?.header_color || "222 47% 18%"})` }}
        >
          <div className="absolute inset-0 opacity-[0.06]">
            <div className="absolute top-0 right-0 h-72 w-72 rounded-full bg-white blur-[100px]" />
            <div className="absolute bottom-0 left-1/4 h-48 w-48 rounded-full bg-white blur-[80px]" />
          </div>
          <div className="container relative mx-auto max-w-4xl">
            <motion.h1
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
              className="mb-3 font-serif text-4xl font-bold text-white md:text-5xl tracking-tight"
            >
              {headerTitle}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }}
              className="text-white/60 text-lg"
            >
              {headerSubtitle}
            </motion.p>
          </div>
        </section>
      )}

      {/* CONTENT */}
      <section className="flex-1 px-4 py-8">
        <div className="container mx-auto max-w-4xl">
          {/* Consultar inscrições */}
          <div className="mb-8 flex justify-end">
            <Dialog open={lookupOpen} onOpenChange={(o) => { setLookupOpen(o); if (!o) { setRegistrations(null); setSelectedReg(null); setCpfInput(""); } }}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Search className="h-4 w-4" /> Consultar minhas inscrições
                </Button>
              </DialogTrigger>
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
                              <p className="mt-1 text-xs text-muted-foreground">
                                Código: {r.registration_code} · Status:{" "}
                                <span className={r.payment_status === "approved" ? "text-green-600 font-medium" : "text-amber-600 font-medium"}>
                                  {r.payment_status === "approved" ? "Confirmada" : "Pendente"}
                                </span>
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Credential Card */
                  <div className="space-y-4">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedReg(null)} className="gap-1 text-muted-foreground">
                      ← Voltar
                    </Button>

                    <Card className="border-2 border-primary/20">
                      <CardContent className="p-6 space-y-4">
                        {/* Event info */}
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

                        {/* Participant info */}
                        <div className="space-y-1 text-sm">
                          <p><span className="font-medium text-foreground">Nome:</span> {selectedReg.full_name}</p>
                          <p><span className="font-medium text-foreground">E-mail:</span> {selectedReg.email}</p>
                          <p><span className="font-medium text-foreground">Código:</span> {selectedReg.registration_code}</p>
                          <p>
                            <span className="font-medium text-foreground">Status:</span>{" "}
                            <span className={selectedReg.payment_status === "approved" ? "text-green-600 font-medium" : "text-amber-600 font-medium"}>
                              {selectedReg.payment_status === "approved" ? "Confirmada" : "Pendente"}
                            </span>
                          </p>
                        </div>

                        {/* QR Code */}
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

                        {!selectedReg.qr_token && (
                          <p className="text-center text-sm text-amber-600">
                            O QR Code será gerado após a confirmação do pagamento.
                          </p>
                        )}

                        {/* Download button */}
                        <div className="flex justify-center pt-2">
                          <Button
                            variant="outline"
                            className="gap-2"
                            onClick={() => handleDownloadCredential(selectedReg)}
                          >
                            <Download className="h-4 w-4" /> Baixar Credencial
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>

          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <BookOpen className="mb-4 h-16 w-16 text-muted-foreground" />
              <h2 className="mb-2 font-serif text-3xl font-bold text-foreground">Nenhum evento publicado</h2>
              <p className="text-muted-foreground">Em breve teremos novidades. Volte logo!</p>
            </div>
          ) : (
            <motion.div
              className="space-y-6"
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
            >
              {events.map((ev) => {
                const isClosed = ev.status === "closed";
                const dateStr = new Date(ev.start_date + "T00:00:00").toLocaleDateString("pt-BR", {
                  day: "numeric", month: "long", year: "numeric",
                });

                return (
                  <motion.div key={ev.id} variants={fadeUp}>
                    <Card
                      className="group cursor-pointer overflow-hidden border-border/50 bg-card shadow-premium hover:shadow-premium-lg transition-all duration-300"
                      onClick={() => navigate(`/evento/${ev.slug}`)}
                    >
                      <div className="flex flex-col md:flex-row">
                        {((ev as any).poster_url || ev.banner_url) && (
                          <div className="h-48 md:h-auto md:w-72 flex-shrink-0 overflow-hidden">
                            <img src={((ev as any).poster_url || ev.banner_url)!} alt={ev.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          </div>
                        )}
                        <CardContent className="flex flex-1 flex-col justify-between p-6 lg:p-8">
                          <div>
                            <h2 className="mb-2 font-serif text-2xl font-bold text-foreground tracking-tight group-hover:text-accent transition-colors duration-300">{ev.title}</h2>
                            {ev.subtitle && <p className="mb-4 text-muted-foreground leading-relaxed">{ev.subtitle}</p>}
                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1.5">
                                <Calendar className="h-4 w-4 text-accent/70" /> {dateStr}
                              </span>
                              {ev.location_name && (
                                <span className="flex items-center gap-1.5">
                                  <MapPin className="h-4 w-4 text-accent/70" /> {ev.location_name}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="mt-5 flex items-center justify-between pt-4 border-t border-border/40">
                            <span className="font-serif text-2xl font-bold text-foreground">
                              {formatCentsToBRL(ev.unit_price_cents)}
                            </span>
                            <Button
                              variant={isClosed ? "outline" : "default"}
                              className={`gap-1 ${!isClosed ? "gradient-gold text-white shadow-gold hover:opacity-90" : ""}`}
                              disabled={isClosed}
                            >
                              {isClosed ? "Encerrado" : "Ver detalhes"}
                              {!isClosed && <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </div>
                        </CardContent>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border/60 bg-card px-4 py-8">
        <div className="container mx-auto max-w-4xl flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">{footerText}</p>
          <Link
            to="/admin/login"
            className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            Administrativo
          </Link>
        </div>
      </footer>
    </div>
  );
}
