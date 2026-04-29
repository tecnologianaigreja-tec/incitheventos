import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RegistrationData, EventFormField } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Camera, Search, CheckCircle, XCircle, AlertTriangle, CameraOff, Users } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import DynamicFieldFilters, { applyDynamicFilters, type ActiveFilter } from "@/components/DynamicFieldFilters";
import AdminPagination from "@/components/admin/AdminPagination";

const PAGE_SIZE = 50;

export default function AdminCheckin() {
  const [scannerActive, setScannerActive] = useState(false);
  const [manualSearch, setManualSearch] = useState("");
  const [result, setResult] = useState<{ reg: RegistrationData; status: "success" | "already" | "error" | "not_found" | "not_paid" } | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);

  // Checked-in list + filters
  const [checkedIn, setCheckedIn] = useState<RegistrationData[]>([]);
  const [customFields, setCustomFields] = useState<EventFormField[]>([]);
  const [dynamicFilters, setDynamicFilters] = useState<ActiveFilter[]>([]);
  const [searchCheckedIn, setSearchCheckedIn] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchCheckedIn.trim()), 300);
    return () => clearTimeout(t);
  }, [searchCheckedIn]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [debouncedSearch]);

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

    const { data, count } = await query.range(from, to);
    const regs = (data || []) as unknown as RegistrationData[];
    setCheckedIn(regs);
    setTotalCount(count || 0);

    // Load custom fields for filtering (based on the visible page)
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
    }
  }, [page, debouncedSearch]);

  useEffect(() => { loadCheckedIn(); }, [loadCheckedIn]);

  const processCheckin = useCallback(async (token: string) => {
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

      const registration = reg as unknown as RegistrationData;

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
        action_type: "scan",
        checked_by_user_id: user?.id,
      });

      setResult({ reg: { ...registration, checkin_status: "checked_in", checkin_at: new Date().toISOString() }, status: "success" });
      toast.success(`Check-in de ${registration.full_name} realizado!`);
      loadCheckedIn();
    } finally {
      setTimeout(() => { processingRef.current = false; }, 2000);
    }
  }, [loadCheckedIn]);

  async function handleManualSearch() {
    if (!manualSearch.trim()) return;

    const { data } = await supabase
      .from("registrations")
      .select("*")
      .or(`full_name.ilike.%${manualSearch}%,email.ilike.%${manualSearch}%,registration_code.eq.${manualSearch}`)
      .limit(1)
      .single();

    if (!data) {
      setResult({ reg: null as any, status: "not_found" });
      toast.error("Participante não encontrado");
      return;
    }

    const registration = data as unknown as RegistrationData;

    if (registration.checkin_status === "checked_in") {
      setResult({ reg: registration, status: "already" });
      toast.warning("Participante já registrado");
      return;
    }

    if (registration.payment_status !== "approved") {
      setResult({ reg: registration, status: "not_paid" });
      toast.error("Pagamento não aprovado");
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
      action_type: "manual",
      checked_by_user_id: user?.id,
    });

    setResult({ reg: { ...registration, checkin_status: "checked_in", checkin_at: new Date().toISOString() }, status: "success" });
    toast.success(`Check-in de ${registration.full_name} realizado!`);
    loadCheckedIn();
  }

  async function startScanner() {
    try {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => { processCheckin(decodedText); },
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

  // Filter checked-in list
  const filteredCheckedIn = applyDynamicFilters(
    checkedIn.filter(r => {
      if (!searchCheckedIn) return true;
      return r.full_name.toLowerCase().includes(searchCheckedIn.toLowerCase()) ||
        r.email.toLowerCase().includes(searchCheckedIn.toLowerCase());
    }),
    dynamicFilters
  );

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredCheckedIn.length / PAGE_SIZE));
  const paged = filteredCheckedIn.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [dynamicFilters, searchCheckedIn]);

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
              <p className="text-2xl font-bold text-foreground">{checkedIn.length}</p>
              <p className="text-xs text-muted-foreground">Total presentes</p>
            </div>
          </CardContent>
        </Card>
        {dynamicFilters.length > 0 && (
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/20">
                <CheckCircle className="h-6 w-6 text-accent-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{filteredCheckedIn.length}</p>
                <p className="text-xs text-muted-foreground">Filtro ativo</p>
              </div>
            </CardContent>
          </Card>
        )}
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

      {/* Manual search */}
      <Card>
        <CardContent className="p-6">
          <div className="flex gap-2">
            <Input
              placeholder="Buscar por nome, e-mail ou código de inscrição"
              value={manualSearch}
              onChange={e => setManualSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleManualSearch()}
              className="flex-1"
            />
            <Button onClick={handleManualSearch} className="gap-2">
              <Search className="h-4 w-4" /> Buscar
            </Button>
          </div>
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
                await processCheckin((e.target as HTMLInputElement).value);
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
              {dynamicFilters.length > 0 ? `${filteredCheckedIn.length} de ${checkedIn.length}` : checkedIn.length} presente{checkedIn.length !== 1 ? "s" : ""}
            </Badge>
          </div>

          {/* Search + Dynamic filters for checked-in */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar entre presentes..."
              value={searchCheckedIn}
              onChange={e => setSearchCheckedIn(e.target.value)}
              className="pl-10"
            />
          </div>

          {customFields.length > 0 && (
            <DynamicFieldFilters
              customFields={customFields}
              activeFilters={dynamicFilters}
              onFiltersChange={setDynamicFilters}
            />
          )}

          {filteredCheckedIn.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              {checkedIn.length === 0 ? "Nenhum check-in realizado ainda" : "Nenhum resultado para os filtros aplicados"}
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
                    {paged.map((r, i) => (
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
