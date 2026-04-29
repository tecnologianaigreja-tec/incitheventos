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
import { Search, CheckCircle, FileDown, Loader2, Printer, Pencil, UserMinus, Tag, Package, RotateCcw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import DynamicFieldFilters, { applyDynamicFilters, getFieldValue, type ActiveFilter } from "@/components/DynamicFieldFilters";
import { generateEventReportPdf } from "@/lib/reportPdf";
import EditRegistrationDialog from "@/components/EditRegistrationDialog";
import { printLabels } from "@/lib/labelRenderer";
import type { LabelTemplate, LabelElement } from "@/lib/labelTypes";
import AdminPagination from "@/components/admin/AdminPagination";
import { fetchAllPages } from "@/lib/fetchAllPages";

const REG_PAGE_SIZE = 50;

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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [labelFilter, setLabelFilter] = useState<"all" | "unprinted" | "printed">("all");
  const [materialFilter, setMaterialFilter] = useState<"all" | "pending" | "delivered">("all");
  const [selectedReg, setSelectedReg] = useState<RegistrationData | null>(null);
  const [dynamicFilters, setDynamicFilters] = useState<ActiveFilter[]>([]);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [labelTemplate, setLabelTemplate] = useState<LabelTemplate | null>(null);
  const [editingReg, setEditingReg] = useState<RegistrationData | null>(null);
  const [uncheckinTarget, setUncheckinTarget] = useState<RegistrationData | null>(null);
  const [printing, setPrinting] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [printDialog, setPrintDialog] = useState<null | {
    novos: RegistrationData[];
    jaImpressos: RegistrationData[];
    semQr: number;
  }>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, selectedEventId, labelFilter, materialFilter, dynamicFilters]);

  async function loadLabelTemplate() {
    const { data } = await supabase
      .from("label_template")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) {
      setLabelTemplate({
        id: (data as any).id,
        width_mm: Number((data as any).width_mm) || 90.3,
        height_mm: Number((data as any).height_mm) || 29,
        elements: ((data as any).elements || []) as LabelElement[],
        updated_at: (data as any).updated_at,
      });
    }
  }

  async function loadEvents() {
    const { data } = await supabase
      .from("events")
      .select("id, title, start_date, end_date, start_time, end_time, location_name, city, state, unit_price_cents, max_participants, workload_hours")
      .order("start_date", { ascending: false });
    if (data) setEvents(data as EventBasic[]);
  }

  function applyBaseFilters(q: any) {
    if (selectedEventId !== "all") q = q.eq("event_id", selectedEventId);
    if (statusFilter !== "all") q = q.eq("registration_status", statusFilter);
    if (labelFilter === "unprinted") q = q.is("label_printed_at", null);
    if (labelFilter === "printed") q = q.not("label_printed_at", "is", null);
    if (materialFilter === "pending") q = q.is("material_delivered_at", null);
    if (materialFilter === "delivered") q = q.not("material_delivered_at", "is", null);
    if (debouncedSearch) {
      const escaped = debouncedSearch.replace(/[%,]/g, "");
      q = q.or(
        `full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,cpf.ilike.%${escaped}%,registration_code.ilike.%${escaped}%`,
      );
    }
    return q;
  }

  function buildRegistrationsQuery() {
    return applyBaseFilters(
      supabase.from("registrations").select("*", { count: "exact" }).order("created_at", { ascending: false })
    );
  }

  function buildRegistrationsListQuery() {
    return applyBaseFilters(
      supabase.from("registrations").select("*").order("created_at", { ascending: false })
    );
  }

  async function loadCustomFields() {
    let fieldsQuery: any = supabase
      .from("event_form_fields")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");

    if (selectedEventId !== "all") {
      fieldsQuery = fieldsQuery.eq("event_id", selectedEventId);
    }

    const { data: fields } = await fieldsQuery;
    if (!fields) {
      setCustomFields([]);
      return;
    }

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

  async function load() {
    setLoading(true);
    const from = (page - 1) * REG_PAGE_SIZE;
    const to = from + REG_PAGE_SIZE - 1;

    await loadCustomFields();

    if (dynamicFilters.length > 0) {
      const all = await fetchAllPages<RegistrationData>(() => buildRegistrationsListQuery());
      const fullyFiltered = applyDynamicFilters(all, dynamicFilters);
      setTotalCount(fullyFiltered.length);
      setRegistrations(fullyFiltered.slice(from, to + 1));
    } else {
      const { data, count } = await buildRegistrationsQuery().range(from, to);
      const regs = (data || []) as unknown as RegistrationData[];
      setRegistrations(regs);
      setTotalCount(count || 0);
    }

    setLoading(false);
  }

  useEffect(() => { loadEvents(); loadLabelTemplate(); }, []);
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedEventId, page, debouncedSearch, statusFilter, labelFilter, materialFilter, dynamicFilters]);

  async function uncheckinRegistration(reg: RegistrationData) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("registrations").update({
      checkin_status: "not_checked_in",
      checkin_at: null,
      checkin_by_user_id: null,
    }).eq("id", reg.id);
    if (error) { toast.error("Erro ao descredenciar"); return; }

    await supabase.from("checkin_logs").delete().eq("registration_id", reg.id);
    await supabase.from("audit_logs").insert({
      action: "registration_uncheckin",
      entity_type: "registration",
      entity_id: reg.id,
      actor_id: user?.id ?? null,
      details: { full_name: reg.full_name, registration_code: reg.registration_code } as any,
    });

    toast.success(`${reg.full_name} descredenciado(a)`);
    setUncheckinTarget(null);
    setSelectedReg(null);
    load();
  }

  async function markPrintedRpc(ids: string[]) {
    if (ids.length === 0) return;
    const { data: { user } } = await supabase.auth.getUser();
    const chunkSize = 200;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { error } = await (supabase as any).rpc("mark_labels_printed", {
        _ids: chunk,
        _user: user?.id ?? null,
      });
      if (error) throw error;
    }
    await supabase.from("audit_logs").insert({
      action: "labels_printed",
      entity_type: "registration",
      actor_id: user?.id ?? null,
      details: { count: ids.length, event_id: selectedEventId } as any,
    });
  }

  async function handlePrintSingle(reg: RegistrationData) {
    if (!labelTemplate || labelTemplate.elements.length === 0) {
      toast.error("Configure o template de etiqueta em Etiquetas antes de imprimir");
      return;
    }
    const usesQr = labelTemplate.elements.some(e => e.type === "qrcode");
    if (usesQr && !reg.qr_token) {
      toast.error("Inscrito sem QR token (pagamento pendente)");
      return;
    }
    setPrinting(true);
    try {
      await printLabels([reg as unknown as Record<string, any>], labelTemplate);
      try { await markPrintedRpc([reg.id]); } catch (e) { console.error(e); }
      load();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar etiqueta");
    }
    setPrinting(false);
  }

  async function handlePrintBatch() {
    if (!labelTemplate || labelTemplate.elements.length === 0) {
      toast.error("Configure o template de etiqueta em Etiquetas antes de imprimir");
      return;
    }
    setPrinting(true);
    try {
      // Fetch all matching registrations across pages (server-side filters preserved)
      const all = await fetchAllPages<RegistrationData>(() => {
        let q: any = supabase.from("registrations").select("*").order("created_at", { ascending: false });
        if (selectedEventId !== "all") q = q.eq("event_id", selectedEventId);
        if (statusFilter !== "all") q = q.eq("registration_status", statusFilter);
        if (labelFilter === "unprinted") q = q.is("label_printed_at", null);
        if (labelFilter === "printed") q = q.not("label_printed_at", "is", null);
        if (materialFilter === "pending") q = q.is("material_delivered_at", null);
        if (materialFilter === "delivered") q = q.not("material_delivered_at", "is", null);
        if (debouncedSearch) {
          const escaped = debouncedSearch.replace(/[%,]/g, "");
          q = q.or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,cpf.ilike.%${escaped}%,registration_code.ilike.%${escaped}%`);
        }
        q = applyDynamicFiltersToQuery(q, dynamicFilters);
        return q;
      });
      // Defensive client-side pass (no-op when server already filtered).
      const allFiltered = applyDynamicFilters(all, dynamicFilters);
      const usesQr = labelTemplate.elements.some(e => e.type === "qrcode");
      const eligible = usesQr ? allFiltered.filter(r => !!r.qr_token) : allFiltered;
      const semQr = allFiltered.length - eligible.length;
      if (eligible.length === 0) {
        toast.error("Nenhum inscrito elegível (sem QR token disponível)");
        setPrinting(false);
        return;
      }
      const novos = eligible.filter(r => !r.label_printed_at);
      const jaImpressos = eligible.filter(r => !!r.label_printed_at);
      setPrintDialog({ novos, jaImpressos, semQr });
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar etiquetas");
    }
    setPrinting(false);
  }

  async function executePrint(toPrint: RegistrationData[]) {
    if (!labelTemplate || toPrint.length === 0) return;
    setPrinting(true);
    try {
      await printLabels(toPrint as unknown as Record<string, any>[], labelTemplate);
      try { await markPrintedRpc(toPrint.map(r => r.id)); } catch (e) { console.error(e); }
      setPrintDialog(null);
      load();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar etiquetas");
    }
    setPrinting(false);
  }

  async function unmarkPrinted(reg: RegistrationData) {
    const { error } = await (supabase.from("registrations") as any).update({
      label_printed_at: null,
      label_printed_by: null,
    }).eq("id", reg.id);
    if (error) { toast.error("Erro ao desmarcar etiqueta"); return; }
    toast.success("Etiqueta marcada como não impressa");
    setSelectedReg({ ...reg, label_printed_at: null, label_printed_by: null });
    load();
  }

  async function toggleMaterial(reg: RegistrationData, deliver: boolean) {
    const { data: { user } } = await supabase.auth.getUser();
    const payload = deliver
      ? { material_delivered_at: new Date().toISOString(), material_delivered_by: user?.id ?? null }
      : { material_delivered_at: null, material_delivered_by: null };
    const { error } = await (supabase.from("registrations") as any).update(payload).eq("id", reg.id);
    if (error) { toast.error("Erro ao atualizar material"); return; }
    await supabase.from("audit_logs").insert({
      action: deliver ? "material_delivered" : "material_undelivered",
      entity_type: "registration",
      entity_id: reg.id,
      actor_id: user?.id ?? null,
      details: { full_name: reg.full_name } as any,
    });
    // Optimistic local update
    setRegistrations(prev => prev.map(r => r.id === reg.id ? ({ ...r, ...payload } as RegistrationData) : r));
    if (selectedReg?.id === reg.id) setSelectedReg({ ...reg, ...payload } as RegistrationData);
    toast.success(deliver ? "Material marcado como entregue" : "Material revertido para pendente");
  }


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

  // Server-side already applied search + status + event filter; only dynamic
  // (custom_fields jsonb) filters are applied here over the current page.
  const filtered = applyDynamicFilters(registrations, dynamicFilters);

  async function handleDownloadReport() {
    const eventData = selectedEventId !== "all"
      ? events.find(e => e.id === selectedEventId)
      : null;

    if (!eventData && selectedEventId !== "all") {
      toast.error("Evento não encontrado");
      return;
    }

    if (totalCount === 0) {
      toast.error("Nenhum inscrito para gerar relatório");
      return;
    }

    setGeneratingReport(true);

    try {
      // Fetch all matching registrations across pages
      const all = await fetchAllPages<RegistrationData>(() => {
        let q: any = supabase.from("registrations").select("*").order("created_at", { ascending: false });
        if (selectedEventId !== "all") q = q.eq("event_id", selectedEventId);
        if (statusFilter !== "all") q = q.eq("registration_status", statusFilter);
        if (labelFilter === "unprinted") q = q.is("label_printed_at", null);
        if (labelFilter === "printed") q = q.not("label_printed_at", "is", null);
        if (materialFilter === "pending") q = q.is("material_delivered_at", null);
        if (materialFilter === "delivered") q = q.not("material_delivered_at", "is", null);
        if (debouncedSearch) {
          const escaped = debouncedSearch.replace(/[%,]/g, "");
          q = q.or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,cpf.ilike.%${escaped}%,registration_code.ilike.%${escaped}%`);
        }
        q = applyDynamicFiltersToQuery(q, dynamicFilters);
        return q;
      });
      const allFiltered = applyDynamicFilters(all, dynamicFilters);

      if (allFiltered.length === 0) {
        toast.error("Nenhum inscrito para gerar relatório");
        return;
      }

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
        registrations: allFiltered,
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
    { label: "Etiqueta impressa", getValue: r => r.label_printed_at ? `Sim — ${new Date(r.label_printed_at).toLocaleString("pt-BR")}${r.label_print_count > 1 ? ` (${r.label_print_count}x)` : ""}` : "Não" },
    { label: "Material entregue", getValue: r => r.material_delivered_at ? `Sim — ${new Date(r.material_delivered_at).toLocaleString("pt-BR")}` : "Não" },
    { label: "Data da inscrição", getValue: r => new Date(r.created_at).toLocaleString("pt-BR") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl font-bold text-foreground">Inscritos</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="outline" className="text-sm">{totalCount} resultado{totalCount !== 1 ? "s" : ""}</Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrintBatch}
            disabled={printing || totalCount === 0}
            className="gap-2"
          >
            {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Imprimir etiquetas ({totalCount})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadReport}
            disabled={generatingReport || totalCount === 0}
            className="gap-2"
          >
            {generatingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Relatório PDF
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
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
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Status: Todos</SelectItem>
            <SelectItem value="pending_payment">Pendente</SelectItem>
            <SelectItem value="confirmed">Confirmado</SelectItem>
            <SelectItem value="canceled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={labelFilter} onValueChange={(v) => setLabelFilter(v as any)}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Etiqueta" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Etiqueta: Todos</SelectItem>
            <SelectItem value="unprinted">Não impressos</SelectItem>
            <SelectItem value="printed">Impressos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={materialFilter} onValueChange={(v) => setMaterialFilter(v as any)}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Material" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Material: Todos</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="delivered">Entregue</SelectItem>
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
              <TableHead className="text-center">Etiqueta</TableHead>
              <TableHead className="text-center">Material</TableHead>
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
                <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                  {r.label_printed_at ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="default" className="gap-1 cursor-help">
                            <Tag className="h-3 w-3" /> Impressa
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          {new Date(r.label_printed_at).toLocaleString("pt-BR")}
                          {r.label_print_count > 1 && ` (${r.label_print_count}x)`}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-2">
                    <Checkbox
                      checked={!!r.material_delivered_at}
                      onCheckedChange={(v) => toggleMaterial(r, !!v)}
                      aria-label="Material entregue"
                    />
                    {r.material_delivered_at && (
                      <Badge variant="default" className="gap-1">
                        <Package className="h-3 w-3" /> Entregue
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    {r.payment_status === "approved" && r.checkin_status !== "checked_in" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => manualCheckin(r)}
                        className="gap-1"
                      >
                        <CheckCircle className="h-3 w-3" /> Check-in
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePrintSingle(r)}
                      className="gap-1"
                      title="Imprimir etiqueta"
                    >
                      <Printer className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">{totalCount === 0 ? "Nenhum inscrito encontrado" : "Nenhum resultado nos filtros aplicados"}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <AdminPagination
        page={page}
        pageSize={REG_PAGE_SIZE}
        total={totalCount}
        onPageChange={setPage}
      />

      {/* Registration Detail Dialog */}
      <Dialog open={!!selectedReg} onOpenChange={(open) => { if (!open) setSelectedReg(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Ficha do Inscrito</DialogTitle>
          </DialogHeader>
          {selectedReg && (
            <>
              <div className="flex flex-wrap gap-2 pb-3 border-b border-border">
                <Button size="sm" variant="outline" onClick={() => { setEditingReg(selectedReg); }} className="gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Editar dados
                </Button>
                <Button size="sm" variant="outline" onClick={() => handlePrintSingle(selectedReg)} disabled={printing} className="gap-1.5">
                  <Printer className="h-3.5 w-3.5" /> Imprimir etiqueta
                </Button>
                {selectedReg.label_printed_at && (
                  <Button size="sm" variant="outline" onClick={() => unmarkPrinted(selectedReg)} className="gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" /> Marcar como não impresso
                  </Button>
                )}
                {selectedReg.material_delivered_at ? (
                  <Button size="sm" variant="outline" onClick={() => toggleMaterial(selectedReg, false)} className="gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" /> Reverter material
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => toggleMaterial(selectedReg, true)} className="gap-1.5">
                    <Package className="h-3.5 w-3.5" /> Marcar material entregue
                  </Button>
                )}
                {selectedReg.checkin_status === "checked_in" && (
                  <Button size="sm" variant="destructive" onClick={() => setUncheckinTarget(selectedReg)} className="gap-1.5">
                    <UserMinus className="h-3.5 w-3.5" /> Descredenciar
                  </Button>
                )}
              </div>
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
            </>
          )}
        </DialogContent>
      </Dialog>

      <EditRegistrationDialog
        registration={editingReg}
        customFields={customFields}
        open={!!editingReg}
        onOpenChange={(o) => { if (!o) setEditingReg(null); }}
        onSaved={() => { load(); setSelectedReg(null); }}
      />

      <AlertDialog open={!!uncheckinTarget} onOpenChange={(o) => { if (!o) setUncheckinTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descredenciar participante?</AlertDialogTitle>
            <AlertDialogDescription>
              {uncheckinTarget && `Isso removerá o check-in de ${uncheckinTarget.full_name} e apagará os registros de credenciamento associados. Não é possível desfazer.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => uncheckinTarget && uncheckinRegistration(uncheckinTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Descredenciar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Print batch dialog: choose between only-new vs reprint-all */}
      <Dialog open={!!printDialog} onOpenChange={(o) => { if (!o) setPrintDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Imprimir etiquetas</DialogTitle>
          </DialogHeader>
          {printDialog && (
            <div className="space-y-4">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Novos (não impressos):</span>
                  <span className="font-semibold text-foreground">{printDialog.novos.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Já impressos antes:</span>
                  <span className="font-semibold text-foreground">{printDialog.jaImpressos.length}</span>
                </div>
                {printDialog.semQr > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pulados (sem QR):</span>
                    <span className="font-semibold text-foreground">{printDialog.semQr}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => executePrint(printDialog.novos)}
                  disabled={printing || printDialog.novos.length === 0}
                  className="gap-2"
                >
                  {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                  Imprimir só os novos ({printDialog.novos.length})
                </Button>
                <Button
                  variant="outline"
                  onClick={() => executePrint([...printDialog.novos, ...printDialog.jaImpressos])}
                  disabled={printing}
                  className="gap-2"
                >
                  <Printer className="h-4 w-4" />
                  Reimprimir todos ({printDialog.novos.length + printDialog.jaImpressos.length})
                </Button>
                <Button variant="ghost" onClick={() => setPrintDialog(null)} disabled={printing}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
