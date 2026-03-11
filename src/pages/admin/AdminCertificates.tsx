import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RegistrationData } from "@/lib/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Award, Download, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import CertificateTemplateEditor from "@/components/CertificateTemplateEditor";
import { generateCertificatePdf } from "@/lib/certificatePdf";
import { format } from "date-fns";

export default function AdminCertificates() {
  const [registrations, setRegistrations] = useState<RegistrationData[]>([]);
  const [certificates, setCertificates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function loadEvents() {
    const { data } = await supabase.from("events").select("id, title, status, start_date, end_date, workload_hours");
    setEvents(data || []);
    if (data && data.length > 0 && !selectedEventId) {
      setSelectedEventId(data[0].id);
    }
  }

  async function loadData() {
    if (!selectedEventId) { setLoading(false); return; }
    setLoading(true);
    const [regsRes, certsRes] = await Promise.all([
      supabase.from("registrations").select("*").eq("event_id", selectedEventId).eq("payment_status", "approved").eq("checkin_status", "checked_in"),
      supabase.from("certificates").select("*"),
    ]);
    setRegistrations((regsRes.data || []) as unknown as RegistrationData[]);
    setCertificates(certsRes.data || []);
    setLoading(false);
  }

  useEffect(() => { loadEvents(); }, []);
  useEffect(() => { if (selectedEventId) loadData(); }, [selectedEventId]);

  async function issueCertificate(reg: RegistrationData) {
    const event = events.find(e => e.id === reg.event_id);
    if (!event || (event.status !== "closed" && event.status !== "concluded")) {
      toast.error("O evento precisa estar encerrado para emitir certificados");
      return;
    }

    const certCode = "CERT-" + Math.random().toString(36).substring(2, 10).toUpperCase();
    const validationHash = crypto.randomUUID();

    const { error } = await supabase.from("certificates").insert({
      registration_id: reg.id,
      certificate_code: certCode,
      validation_hash: validationHash,
    });

    if (error) {
      if (error.code === "23505") { toast.error("Certificado já emitido"); }
      else { toast.error("Erro ao emitir certificado"); }
      return;
    }

    await supabase.from("registrations").update({
      certificate_status: "issued",
      certificate_issued_at: new Date().toISOString(),
    }).eq("id", reg.id);

    toast.success(`Certificado emitido para ${reg.full_name}`);
    loadData();
  }

  async function issueAll() {
    const eligible = registrations.filter(r => !certificates.find(c => c.registration_id === r.id));
    if (eligible.length === 0) { toast.info("Todos os certificados elegíveis já foram emitidos"); return; }
    for (const reg of eligible) {
      await issueCertificate(reg);
    }
  }

  async function downloadCertificatePdf(reg: RegistrationData) {
    const cert = certificates.find(c => c.registration_id === reg.id);
    if (!cert) return;

    setDownloadingId(reg.id);
    try {
      // Load template
      const { data: template } = await supabase
        .from("certificate_templates")
        .select("*")
        .eq("event_id", reg.event_id)
        .maybeSingle();

      const event = events.find(e => e.id === reg.event_id);

      const doc = await generateCertificatePdf({
        logoUrl: template?.logo_url,
        bodyText: template?.body_text || "Certificamos que {nome} participou do evento {evento}, realizado no período de {data_inicio} a {data_fim}, com carga horária de {carga_horaria} horas.",
        signatureImageUrl: template?.signature_image_url,
        signatureName: template?.signature_name,
        signatureTitle: template?.signature_title,
        participantName: reg.full_name,
        eventTitle: event?.title || "",
        startDate: event?.start_date ? format(new Date(event.start_date + "T12:00:00"), "dd/MM/yyyy") : "",
        endDate: event?.end_date ? format(new Date(event.end_date + "T12:00:00"), "dd/MM/yyyy") : "",
        workloadHours: event?.workload_hours,
        certificateCode: cert.certificate_code,
        validationHash: cert.validation_hash,
      });

      doc.save(`certificado-${reg.full_name.replace(/\s+/g, "_")}.pdf`);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar PDF");
    }
    setDownloadingId(null);
  }

  const selectedEvent = events.find(e => e.id === selectedEventId);

  return (
    <div className="space-y-6">
      {/* Event selector */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="space-y-1 flex-1 max-w-xs">
          <Label>Evento</Label>
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger><SelectValue placeholder="Selecione um evento" /></SelectTrigger>
            <SelectContent>
              {events.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedEventId && (
        <Tabs defaultValue="certificates">
          <TabsList>
            <TabsTrigger value="certificates" className="gap-1.5"><Award className="h-3.5 w-3.5" /> Certificados</TabsTrigger>
            <TabsTrigger value="template" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Layout do Certificado</TabsTrigger>
          </TabsList>

          <TabsContent value="certificates" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl font-bold text-foreground">Certificados</h2>
              <Button onClick={issueAll} className="gap-2"><Award className="h-4 w-4" /> Emitir Todos Elegíveis</Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
            ) : (
              <div className="rounded-lg border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Check-in</TableHead>
                      <TableHead>Certificado</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {registrations.map(r => {
                      const cert = certificates.find(c => c.registration_id === r.id);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.full_name}</TableCell>
                          <TableCell className="text-sm">{r.email}</TableCell>
                          <TableCell><Badge variant="default">✓</Badge></TableCell>
                          <TableCell>
                            {cert ? (
                              <Badge variant="default">{cert.certificate_code}</Badge>
                            ) : (
                              <Badge variant="secondary">Não emitido</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {!cert && (
                                <Button variant="ghost" size="sm" onClick={() => issueCertificate(r)} className="gap-1">
                                  <Award className="h-3 w-3" /> Emitir
                                </Button>
                              )}
                              {cert && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => downloadCertificatePdf(r)}
                                  disabled={downloadingId === r.id}
                                  className="gap-1"
                                >
                                  <Download className="h-3 w-3" />
                                  {downloadingId === r.id ? "Gerando..." : "PDF"}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {registrations.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">Nenhum participante elegível</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="template" className="mt-4">
            <CertificateTemplateEditor eventId={selectedEventId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
