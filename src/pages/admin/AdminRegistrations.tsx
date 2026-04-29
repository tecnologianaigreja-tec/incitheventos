import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RegistrationData, EventFormField } from "@/lib/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Search, CheckCircle, FileDown, Loader2, Printer, Pencil, UserMinus } from "lucide-react";
import DynamicFieldFilters, { applyDynamicFilters, getFieldValue, type ActiveFilter } from "@/components/DynamicFieldFilters";
import { generateEventReportPdf } from "@/lib/reportPdf";
import EditRegistrationDialog from "@/components/EditRegistrationDialog";
import { printLabels } from "@/lib/labelRenderer";
import type { LabelTemplate, LabelElement } from "@/lib/labelTypes";

interface EventBasic {
  id: string;
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

export default function AdminRegistrations() {
  const [events, setEvents] = useState<EventBasic[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("all");
  const [registrations, setRegistrations] = useState<RegistrationData[]>([]);
  const [customFields, setCustomFields] = useState<EventFormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedReg, setSelectedReg] = useState<RegistrationData | null>(null);
  const [dynamicFilters, setDynamicFilters] = useState<ActiveFilter[]>([]);
  const [generatingReport, setGeneratingReport] = useState(false);

  async function loadEvents() {
    const { data } = await supabase
      .from("events")
      .select("id, title, start_date, end_date, start_time, end_time, location_name, city, state, unit_price_cents, max_participants, workload_hours")
      .order("start_date", { ascending: false });
    if (data) setEvents(data as EventBasic[]);
  }

  async function load() {
    setLoading(true);
    let query = supabase.from("registrations").select("*").order("created_at", { ascending: false });
    if (selectedEventId !== "all") {
      query = query.eq("event_id", selectedEventId);
    }
    const { data } = await query;
    const regs = (data || []) as unknown as RegistrationData[];
    setRegistrations(regs);

    if (regs.length > 0) {
      const eventIds = [...new Set(regs.map(r => r.event_id))];
      const { data: fields } = await supabase
        .from("event_form_fields")
        .select("*")
        .in("event_id", eventIds)
        .eq("is_active", true)
        .order("sort_order");
      if (fields) {
        const seen = new Set<string>();
        const unique: EventFormField[] = [];
        for (const f of fields as unknown as EventFormField[]) {
          if (!seen.has(f.field_key)) {
            seen.add(f.field_key);
            unique.push(f);
          }
        }
        setCustomFields(unique);
      }
    } else {
      setCustomFields([]);
    }
    setLoading(false);
  }

  useEffect(() => { loadEvents(); }, []);
  useEffect(() => { load(); }, [selectedEventId]);

  async function manualCheckin(reg: RegistrationData) {
    if (reg.checkin_status === "checked_in") { toast.error("Já realizou check-in"); return; }
    if (reg.payment_status !== "approved") { toast.error("Pagamento não aprovado"); return; }

    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from("registrations").update({
      checkin_status: "checked_in",
      checkin_at: new Date().toISOString(),
      checkin_by_user_id: user?.id,
    }).eq("id", reg.id);

    if (error) { toast.error("Erro ao fazer check-in"); return; }

    await supabase.from("checkin_logs").insert({
      registration_id: reg.id,
      action_type: "manual",
      checked_by_user_id: user?.id,
    });

    toast.success(`Check-in de ${reg.full_name} realizado`);
    load();
  }

  const filtered = applyDynamicFilters(
    registrations.filter(r => {
      const matchSearch = !search || r.full_name.toLowerCase().includes(search.toLowerCase()) ||
        r.email.toLowerCase().includes(search.toLowerCase()) ||
        r.registration_code.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || r.registration_status === statusFilter;
      return matchSearch && matchStatus;
    }),
    dynamicFilters
  );

  async function handleDownloadReport() {
    const eventData = selectedEventId !== "all"
      ? events.find(e => e.id === selectedEventId)
      : null;

    if (!eventData && selectedEventId !== "all") {
      toast.error("Evento não encontrado");
      return;
    }

    if (filtered.length === 0) {
      toast.error("Nenhum inscrito para gerar relatório");
      return;
    }

    setGeneratingReport(true);

    try {
      // Build filter description
      const filterParts: string[] = [];
      if (search) filterParts.push(`Busca: "${search}"`);
      if (statusFilter !== "all") {
        const statusLabels: Record<string, string> = {
          pending_payment: "Pendente", confirmed: "Confirmado", canceled: "Cancelado",
        };
        filterParts.push(`Status: ${statusLabels[statusFilter] || statusFilter}`);
      }
      for (const f of dynamicFilters) {
        filterParts.push(`${f.fieldLabel}: ${f.value}`);
      }

      // When "all events", compute a representative price from available events
      const allEventsPrice = events.length > 0
        ? events.reduce((sum, e) => sum + e.unit_price_cents, 0) / events.length
        : 0;

      const eventInfo = eventData || {
        title: "Todos os Eventos",
        start_date: events.length > 0 ? events[events.length - 1].start_date : new Date().toISOString().substring(0, 10),
        end_date: events.length > 0 ? events[0].start_date : new Date().toISOString().substring(0, 10),
        start_time: null,
        end_time: null,
        location_name: null,
        city: null,
        state: null,
        unit_price_cents: Math.round(allEventsPrice),
        max_participants: null,
        workload_hours: null,
      };

      const doc = generateEventReportPdf({
        event: eventInfo,
        registrations: filtered,
        filterDescription: filterParts.length > 0 ? filterParts.join(" | ") : null,
      });

      doc.save(`relatorio-${eventData?.title.replace(/\s+/g, "-").toLowerCase() || "geral"}-${new Date().toISOString().substring(0, 10)}.pdf`);
      toast.success("Relatório gerado com sucesso!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar relatório");
    }

    setGeneratingReport(false);
  }

  if (loading) return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  const fixedDetails: { label: string; getValue: (r: RegistrationData) => string }[] = [
    { label: "Nome completo", getValue: r => r.full_name },
    { label: "E-mail", getValue: r => r.email },
    { label: "CPF", getValue: r => r.cpf },
    { label: "Telefone", getValue: r => r.phone || "—" },
    { label: "Data de nascimento", getValue: r => r.birth_date ? new Date(r.birth_date + "T00:00:00").toLocaleDateString("pt-BR") : "—" },
    { label: "Congregação", getValue: r => r.congregation || "—" },
    { label: "Área", getValue: r => r.area || "—" },
    { label: "Cargo", getValue: r => r.church_role || "—" },
    { label: "Função", getValue: r => r.church_function || "—" },
    { label: "Código de inscrição", getValue: r => r.registration_code },
    { label: "Tipo", getValue: r => r.registration_type === "individual" ? "Individual" : "Lote" },
    { label: "Status pagamento", getValue: r => r.payment_status === "approved" ? "Pago" : r.payment_status === "pending" ? "Pendente" : r.payment_status },
    { label: "Check-in", getValue: r => r.checkin_status === "checked_in" ? `Sim — ${r.checkin_at ? new Date(r.checkin_at).toLocaleString("pt-BR") : ""}` : "Não" },
    { label: "Data da inscrição", getValue: r => new Date(r.created_at).toLocaleString("pt-BR") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl font-bold text-foreground">Inscritos</h2>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm">{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadReport}
            disabled={generatingReport || filtered.length === 0}
            className="gap-2"
          >
            {generatingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Relatório PDF
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por nome, e-mail ou código" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={selectedEventId} onValueChange={setSelectedEventId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Evento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os eventos</SelectItem>
            {events.map(e => (
              <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending_payment">Pendente</SelectItem>
            <SelectItem value="confirmed">Confirmado</SelectItem>
            <SelectItem value="canceled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Dynamic field filters */}
      {customFields.length > 0 && (
        <DynamicFieldFilters
          customFields={customFields}
          activeFilters={dynamicFilters}
          onFiltersChange={setDynamicFilters}
        />
      )}

      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(r => (
              <TableRow
                key={r.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setSelectedReg(r)}
              >
                <TableCell className="font-medium text-primary underline-offset-2 hover:underline">{r.full_name}</TableCell>
                <TableCell className="text-sm">{r.email}</TableCell>
                <TableCell className="text-sm">{r.cpf}</TableCell>
                <TableCell><Badge variant="secondary">{r.registration_type === "individual" ? "Ind." : "Lote"}</Badge></TableCell>
                <TableCell>
                  <Badge variant={
                    r.registration_status === "canceled" ? "destructive"
                      : r.payment_status === "approved" ? "default"
                      : "secondary"
                  }>
                    {r.registration_status === "canceled"
                      ? "Cancelado"
                      : r.payment_status === "approved" ? "Pago" : "Pendente"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={r.checkin_status === "checked_in" ? "default" : "outline"}>
                    {r.checkin_status === "checked_in" ? "✓" : "—"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {r.payment_status === "approved" && r.checkin_status !== "checked_in" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); manualCheckin(r); }}
                      className="gap-1"
                    >
                      <CheckCircle className="h-3 w-3" /> Check-in
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Nenhum inscrito encontrado</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Registration Detail Dialog */}
      <Dialog open={!!selectedReg} onOpenChange={(open) => { if (!open) setSelectedReg(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Ficha do Inscrito</DialogTitle>
          </DialogHeader>
          {selectedReg && (
            <div className="space-y-1">
              {fixedDetails.map(({ label, getValue }) => {
                const val = getValue(selectedReg);
                if (val === "—" && !["Nome completo", "E-mail", "CPF", "Código de inscrição", "Tipo", "Status pagamento", "Check-in", "Data da inscrição"].includes(label)) return null;
                return (
                  <div key={label} className="flex justify-between gap-4 border-b border-border/50 py-2.5">
                    <span className="text-sm font-medium text-muted-foreground">{label}</span>
                    <span className="text-sm text-foreground text-right">{val}</span>
                  </div>
                );
              })}
              {customFields.map(f => {
                const val = getFieldValue(selectedReg, f.field_key);
                if (!val) return null;
                return (
                  <div key={f.field_key} className="flex justify-between gap-4 border-b border-border/50 py-2.5">
                    <span className="text-sm font-medium text-muted-foreground">{f.field_label}</span>
                    <span className="text-sm text-foreground text-right">{val}</span>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
