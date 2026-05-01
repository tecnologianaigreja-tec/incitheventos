import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RegistrationData, EventFormField } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Camera, Search, CheckCircle, XCircle, AlertTriangle, CameraOff, Users, Loader2 } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import DynamicFieldFilters, { applyDynamicFilters, type ActiveFilter } from "@/components/DynamicFieldFilters";
import { applyDynamicFiltersToQuery } from "@/lib/dynamicFilterQuery";
import AdminPagination from "@/components/admin/AdminPagination";

const PAGE_SIZE = 50;

// Always-available filter fields (even if event has no custom form fields).
const FIXED_FILTER_FIELDS: EventFormField[] = [
  { id: "fixed-area", event_id: "", field_label: "Área", field_key: "area", field_type: "text", is_required: false, placeholder: null, options: [], sort_order: -4, is_active: true, created_at: "", updated_at: "" },
  { id: "fixed-congregation", event_id: "", field_label: "Congregação", field_key: "congregation", field_type: "text", is_required: false, placeholder: null, options: [], sort_order: -3, is_active: true, created_at: "", updated_at: "" },
  { id: "fixed-church_role", event_id: "", field_label: "Cargo", field_key: "church_role", field_type: "text", is_required: false, placeholder: null, options: [], sort_order: -2, is_active: true, created_at: "", updated_at: "" },
  { id: "fixed-church_function", event_id: "", field_label: "Função", field_key: "church_function", field_type: "text", is_required: false, placeholder: null, options: [], sort_order: -1, is_active: true, created_at: "", updated_at: "" },
];

function maskCpf(cpf: string): string {
  const d = (cpf || "").replace(/\D/g, "");
  if (d.length !== 11) return cpf || "";
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
}

export default function AdminCheckin() {
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerStarting, setScannerStarting] = useState(false);
  const [manualSearch, setManualSearch] = useState("");
  const [searchResults, setSearchResults] = useState<RegistrationData[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [result, setResult] = useState<{ reg: RegistrationData; status: "success" | "already" | "error" | "not_found" | "not_paid" } | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  // Per-token cooldown to ignore the same QR being read repeatedly while in front of the camera
  const lastScannedRef = useRef<Map<string, number>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const resultClearTimerRef = useRef<number | null>(null);

  function ensureAudio() {
    if (!audioCtxRef.current) {
      try {
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
        if (Ctx) audioCtxRef.current = new Ctx();
      } catch {}
    }
    // Resume on user gesture (iOS)
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
  }

  function playTone(freq: number, durationMs: number, delayMs = 0) {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const start = ctx.currentTime + delayMs / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.25, start + 0.01);
    gain.gain.linearRampToValueAtTime(0, start + durationMs / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + durationMs / 1000 + 0.02);
  }

  function playBeep(kind: "success" | "warning" | "error") {
    ensureAudio();
    if (!audioCtxRef.current) return;
    if (kind === "success") {
      playTone(880, 140);
    } else if (kind === "warning") {
      playTone(600, 90, 0);
      playTone(600, 90, 130);
    } else {
      playTone(220, 220);
    }
  }

  function scheduleResultClear(ms: number) {
    if (resultClearTimerRef.current) {
      window.clearTimeout(resultClearTimerRef.current);
    }
    resultClearTimerRef.current = window.setTimeout(() => {
      setResult(null);
      resultClearTimerRef.current = null;
    }, ms);
  }

  // Checked-in list + filters
  const [checkedIn, setCheckedIn] = useState<RegistrationData[]>([]);
  const [customFields, setCustomFields] = useState<EventFormField[]>(FIXED_FILTER_FIELDS);
  const [dynamicFilters, setDynamicFilters] = useState<ActiveFilter[]>([]);
  const [searchCheckedIn, setSearchCheckedIn] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Debounce search of checked-in list
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchCheckedIn.trim()), 300);
    return () => clearTimeout(t);
  }, [searchCheckedIn]);

  useEffect(() => { setPage(1); }, [debouncedSearch, dynamicFilters]);

  // Load custom fields from ALL events once, so filters always include cargo/área/etc.
  useEffect(() => {
    async function loadFields() {
      const { data } = await supabase
        .from("event_form_fields")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      const seen = new Set<string>(FIXED_FILTER_FIELDS.map(f => f.field_key));
      const merged: EventFormField[] = [...FIXED_FILTER_FIELDS];
      for (const f of (data || []) as unknown as EventFormField[]) {
        if (!seen.has(f.field_key)) {
          seen.add(f.field_key);
          merged.push(f);
        }
      }
      setCustomFields(merged);
    }
    loadFields();
  }, []);

  const loadCheckedIn = useCallback(async () => {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("registrations")
      .select("*", { count: "exact" })
      .eq("checkin_status", "checked_in")
      .order("checkin_at", { ascending: false });

    if (debouncedSearch) {
      const escaped = debouncedSearch.replace(/[%,]/g, "");
      query = query.or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,cpf.ilike.%${escaped}%`);
    }

    // Apply dynamic filters server-side so total + pagination reflect them
    query = applyDynamicFiltersToQuery(query, dynamicFilters);

    const { data, count } = await query.range(from, to);
    const regs = (data || []) as unknown as RegistrationData[];
    setCheckedIn(regs);
    setTotalCount(count || 0);
  }, [page, debouncedSearch, dynamicFilters]);

  useEffect(() => { loadCheckedIn(); }, [loadCheckedIn]);

  /**
   * Performs the actual check-in mutation. Used by QR scan, token paste,
   * and the "Confirmar check-in" button on each search result card.
   */
  const confirmCheckin = useCallback(async (registration: RegistrationData, action: "scan" | "manual" = "manual") => {
    if (registration.payment_status !== "approved") {
      setResult({ reg: registration, status: "not_paid" });
      toast.error("Pagamento não aprovado");
      return;
    }
    if (registration.checkin_status === "checked_in") {
      setResult({ reg: registration, status: "already" });
      toast.warning("Participante já registrado");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("registrations").update({
      checkin_status: "checked_in",
      checkin_at: new Date().toISOString(),
      checkin_by_user_id: user?.id,
    }).eq("id", registration.id);

    if (error) {
      setResult({ reg: registration, status: "error" });
      toast.error("Erro no check-in");
      return;
    }

    await supabase.from("checkin_logs").insert({
      registration_id: registration.id,
      action_type: action,
      checked_by_user_id: user?.id,
    });

    const updated = { ...registration, checkin_status: "checked_in" as const, checkin_at: new Date().toISOString() };
    setResult({ reg: updated, status: "success" });
    toast.success(`Check-in de ${registration.full_name} realizado!`);

    // Reflect in the search list, if visible
    setSearchResults(prev => prev ? prev.map(r => r.id === registration.id ? updated : r) : prev);

    loadCheckedIn();
  }, [loadCheckedIn]);

  const processCheckinByToken = useCallback(async (token: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      const { data: reg } = await supabase
        .from("registrations")
        .select("*")
        .eq("qr_token", token.trim())
        .single();

      if (!reg) {
        setResult({ reg: null as any, status: "not_found" });
        toast.error("QR Code inválido");
        return;
      }
      await confirmCheckin(reg as unknown as RegistrationData, "scan");
    } finally {
      setTimeout(() => { processingRef.current = false; }, 2000);
    }
  }, [confirmCheckin]);

  // NEW: search returns a LIST so the operator can pick the right person
  async function handleManualSearch() {
    const term = manualSearch.trim();
    if (!term) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    try {
      const escaped = term.replace(/[%,]/g, "");
      const { data, error } = await supabase
        .from("registrations")
        .select("*")
        .or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,registration_code.ilike.%${escaped}%,cpf.ilike.%${escaped}%`)
        .order("full_name", { ascending: true })
        .limit(25);

      if (error) {
        toast.error("Erro ao buscar inscrições");
        setSearchResults([]);
        return;
      }
      setSearchResults((data || []) as unknown as RegistrationData[]);
      if (!data || data.length === 0) {
        toast.info("Nenhum inscrito encontrado");
      }
    } finally {
      setSearchLoading(false);
    }
  }

  async function startScanner() {
    try {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => { processCheckinByToken(decodedText); },
        () => {}
      );
      setScannerActive(true);
    } catch {
      toast.error("Não foi possível acessar a câmera");
    }
  }

  async function stopScanner() {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      scannerRef.current = null;
    }
    setScannerActive(false);
  }

  useEffect(() => { return () => { stopScanner(); }; }, []);

  // Filtered list of checked-in (server already applied filters; this is just defensive for UI search of checked-in list)
  const filteredCheckedIn = applyDynamicFilters(checkedIn, []);

  return (
    <div className="space-y-6">
      <h2 className="font-serif text-xl font-bold text-foreground">Check-in</h2>

      {/* Presence Counter */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{totalCount}</p>
              <p className="text-xs text-muted-foreground">
                {dynamicFilters.length > 0 ? "Presentes (filtro aplicado)" : "Total presentes"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* QR Scanner */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Leitura de QR Code</p>
            <Button
              variant={scannerActive ? "destructive" : "default"}
              size="sm"
              onClick={scannerActive ? stopScanner : startScanner}
              className="gap-2"
            >
              {scannerActive ? <><CameraOff className="h-4 w-4" /> Parar Câmera</> : <><Camera className="h-4 w-4" /> Abrir Câmera</>}
            </Button>
          </div>
          <div id="qr-reader" className={`mx-auto overflow-hidden rounded-lg ${scannerActive ? "w-full max-w-sm" : "hidden"}`} />
          {scannerActive && <p className="text-center text-xs text-muted-foreground">Aponte a câmera para o QR Code do participante</p>}
        </CardContent>
      </Card>

      {/* Manual search (lists results — does NOT auto check-in) */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Buscar por nome, e-mail, CPF ou código de inscrição"
              value={manualSearch}
              onChange={e => setManualSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleManualSearch()}
              className="flex-1"
            />
            <Button onClick={handleManualSearch} disabled={searchLoading} className="gap-2">
              <Search className="h-4 w-4" /> {searchLoading ? "Buscando..." : "Buscar"}
            </Button>
          </div>

          {searchResults !== null && (
            <div className="space-y-2">
              {searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum inscrito encontrado para esta busca.</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {searchResults.length} resultado{searchResults.length !== 1 ? "s" : ""} — selecione quem deseja registrar:
                  </p>
                  {searchResults.map(r => {
                    const paid = r.payment_status === "approved";
                    const present = r.checkin_status === "checked_in";
                    return (
                      <div key={r.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-foreground truncate">{r.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {r.email} · CPF {maskCpf(r.cpf)} · Cód. {r.registration_code}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant={paid ? "default" : "destructive"}>{paid ? "Pago" : "Não pago"}</Badge>
                            <Badge variant={present ? "secondary" : "outline"}>
                              {present ? `Presente${r.checkin_at ? ` em ${new Date(r.checkin_at).toLocaleString("pt-BR")}` : ""}` : "Não registrado"}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          disabled={!paid || present}
                          onClick={() => confirmCheckin(r, "manual")}
                          className="gap-2 sm:self-center"
                        >
                          <CheckCircle className="h-4 w-4" />
                          {present ? "Já presente" : !paid ? "Sem pagamento" : "Confirmar check-in"}
                        </Button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* QR Token input */}
      <Card>
        <CardContent className="p-6">
          <p className="mb-3 text-sm font-medium text-foreground">Inserir token do QR Code manualmente:</p>
          <Input
            placeholder="Cole o token do QR Code aqui"
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                await processCheckinByToken((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).value = "";
              }
            }}
          />
        </CardContent>
      </Card>

      {/* Result feedback */}
      {result && result.reg && (
        <Card className={`border-2 ${
          result.status === "success" ? "border-green-500" :
          result.status === "already" ? "border-yellow-500" :
          "border-destructive"
        }`}>
          <CardContent className="flex items-center gap-6 p-8">
            <div className={`flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full ${
              result.status === "success" ? "bg-green-500 text-white" :
              result.status === "already" ? "bg-yellow-500 text-white" :
              "bg-destructive text-destructive-foreground"
            }`}>
              {result.status === "success" ? <CheckCircle className="h-10 w-10" /> :
               result.status === "already" ? <AlertTriangle className="h-10 w-10" /> :
               <XCircle className="h-10 w-10" />}
            </div>
            <div>
              <h3 className="text-2xl font-bold text-foreground">{result.reg.full_name}</h3>
              <p className="text-muted-foreground">{result.reg.email}</p>
              <div className="mt-2 flex gap-2">
                <Badge variant={result.reg.payment_status === "approved" ? "default" : "destructive"}>
                  {result.reg.payment_status === "approved" ? "Pago" : "Não pago"}
                </Badge>
              </div>
              {result.status === "success" && (
                <p className="mt-2 text-sm font-semibold text-green-600">Check-in realizado com sucesso!</p>
              )}
              {result.status === "already" && (
                <p className="mt-2 text-sm font-semibold text-yellow-600">
                  Participante já registrado
                  {result.reg.checkin_at && ` em ${new Date(result.reg.checkin_at).toLocaleString("pt-BR")}`}
                </p>
              )}
              {result.status === "not_paid" && (
                <p className="mt-2 text-sm font-semibold text-destructive">Pagamento não aprovado</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {result && result.status === "not_found" && (
        <Card className="border-2 border-destructive">
          <CardContent className="flex items-center gap-6 p-8">
            <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
              <XCircle className="h-10 w-10" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">Não encontrado</h3>
              <p className="text-muted-foreground">O QR Code ou dados informados não correspondem a nenhuma inscrição.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Checked-in list with filters */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg font-semibold text-foreground">
              Participantes presentes
            </h3>
            <Badge variant="outline" className="text-sm">
              {totalCount} presente{totalCount !== 1 ? "s" : ""}
            </Badge>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar entre presentes..."
              value={searchCheckedIn}
              onChange={e => setSearchCheckedIn(e.target.value)}
              className="pl-10"
            />
          </div>

          <DynamicFieldFilters
            customFields={customFields}
            activeFilters={dynamicFilters}
            onFiltersChange={setDynamicFilters}
          />

          {filteredCheckedIn.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              {totalCount === 0 ? "Nenhum check-in para os critérios atuais" : "Nenhum resultado nesta página"}
            </p>
          ) : (
            <>
              <div className="rounded-lg border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Horário do Check-in</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCheckedIn.map((r, i) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-muted-foreground">{(page - 1) * PAGE_SIZE + i + 1}</TableCell>
                        <TableCell className="font-medium">{r.full_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.email}</TableCell>
                        <TableCell className="text-sm">
                          {r.checkin_at ? new Date(r.checkin_at).toLocaleString("pt-BR") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <AdminPagination
                page={page}
                pageSize={PAGE_SIZE}
                total={totalCount}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
