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
import CertificateVisualEditor from "@/components/CertificateVisualEditor";
import { generateCertificatePdf, type FieldPosition } from "@/lib/certificatePdf";
import { format } from "date-fns";
import AdminPagination from "@/components/admin/AdminPagination";
import { fetchAllPages } from "@/lib/fetchAllPages";

const CERTS_PAGE_SIZE = 50;

export default function AdminCertificates() {
  const [registrations, setRegistrations] = useState<RegistrationData[]>([]);
  const [certificates, setCertificates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [issuingAll, setIssuingAll] = useState(false);

  // Reset page when event changes
  useEffect(() => { setPage(1); }, [selectedEventId]);

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
    const from = (page - 1) * CERTS_PAGE_SIZE;
    const to = from + CERTS_PAGE_SIZE - 1;

    const regsRes = await supabase
      .from("registrations")
      .select("*", { count: "exact" })
      .eq("event_id", selectedEventId)
      .eq("payment_status", "approved")
      .eq("checkin_status", "checked_in")
      .order("full_name", { ascending: true })
      .range(from, to);

    const regs = (regsRes.data || []) as unknown as RegistrationData[];
    setRegistrations(regs);
    setTotalCount(regsRes.count || 0);

    // Load only certificates for visible registrations
    if (regs.length > 0) {
      const ids = regs.map(r => r.id);
      const certsRes = await supabase.from("certificates").select("*").in("registration_id", ids);
      setCertificates(certsRes.data || []);
    } else {
      setCertificates([]);
    }
    setLoading(false);
  }

  useEffect(() => { loadEvents(); }, []);
  useEffect(() => { if (selectedEventId) loadData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedEventId, page]);

  async function ensureTemplateConfigured(eventId: string): Promise<boolean> {
    const { data } = await supabase
      .from("certificate_templates")
      .select("background_url")
      .eq("event_id", eventId)
      .maybeSingle();
    if (!data || !(data as any).background_url) {
      toast.error("Configure o editor visual do certificado (com imagem de fundo) antes de emitir");
      return false;
    }
    return true;
  }

  async function issueCertificate(reg: RegistrationData) {
    const event = events.find(e => e.id === reg.event_id);
    if (!event || (event.status !== "closed" && event.status !== "concluded")) {
      toast.error("O evento precisa estar encerrado para emitir certificados");
      return;
    }
    if (!(await ensureTemplateConfigured(reg.event_id))) return;

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
    const event = events.find(e => e.id === selectedEventId);
    if (!event || (event.status !== "closed" && event.status !== "concluded")) {
      toast.error("O evento precisa estar encerrado para emitir certificados");
      return;
    }
    if (!(await ensureTemplateConfigured(selectedEventId))) return;

    setIssuingAll(true);
    try {
      // Fetch all eligible registrations across pages
      const allRegs = await fetchAllPages<RegistrationData>(() =>
        supabase
          .from("registrations")
          .select("*")
          .eq("event_id", selectedEventId)
          .eq("payment_status", "approved")
          .eq("checkin_status", "checked_in")
          .order("full_name", { ascending: true }),
      );
      // Fetch existing certificates for those IDs
      const ids = allRegs.map(r => r.id);
      let existingCertIds = new Set<string>();
      if (ids.length > 0) {
        // Chunk to avoid overly long IN clauses
        for (let i = 0; i < ids.length; i += 500) {
          const chunk = ids.slice(i, i + 500);
          const { data } = await supabase.from("certificates").select("registration_id").in("registration_id", chunk);
          (data || []).forEach((c: any) => existingCertIds.add(c.registration_id));
        }
      }
      const eligible = allRegs.filter(r => !existingCertIds.has(r.id));
      if (eligible.length === 0) {
        toast.info("Todos os certificados elegíveis já foram emitidos");
        return;
      }

      let success = 0;
      for (const reg of eligible) {
        const certCode = "CERT-" + Math.random().toString(36).substring(2, 10).toUpperCase();
        const validationHash = crypto.randomUUID();
        const { error } = await supabase.from("certificates").insert({
          registration_id: reg.id,
          certificate_code: certCode,
          validation_hash: validationHash,
        });
        if (!error) {
          await supabase.from("registrations").update({
            certificate_status: "issued",
            certificate_issued_at: new Date().toISOString(),
          }).eq("id", reg.id);
          success++;
        }
      }
      toast.success(`${success} certificado(s) emitido(s)`);
      loadData();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao emitir certificados em lote");
    } finally {
      setIssuingAll(false);
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
      const backgroundUrl = (template as any)?.background_url as string | null | undefined;
      const fieldPositions = ((template as any)?.field_positions as FieldPosition[] | undefined) || [];

      if (!backgroundUrl) {
        toast.error("Configure o editor visual do certificado primeiro");
        setDownloadingId(null);
        return;
      }

      const doc = await generateCertificatePdf({
        backgroundUrl,
        fieldPositions,
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
          <Select value={selectedEventId || undefined} onValueChange={setSelectedEventId}>
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
            <TabsTrigger value="template" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Editor do Certificado</TabsTrigger>
          </TabsList>

          <TabsContent value="certificates" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl font-bold text-foreground">Certificados</h2>
              <Button onClick={issueAll} disabled={issuingAll} className="gap-2">
                <Award className="h-4 w-4" /> {issuingAll ? "Emitindo..." : "Emitir Todos Elegíveis"}
              </Button>
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
            <AdminPagination
              page={page}
              pageSize={CERTS_PAGE_SIZE}
              total={totalCount}
              onPageChange={setPage}
            />
          </TabsContent>

          <TabsContent value="template" className="mt-4">
            <CertificateVisualEditor eventId={selectedEventId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
