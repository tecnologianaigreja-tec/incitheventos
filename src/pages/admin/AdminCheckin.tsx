import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RegistrationData, EventFormField } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Camera, Search, CheckCircle, XCircle, AlertTriangle, CameraOff, Users, Loader2, FileDown } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import DynamicFieldFilters, { applyDynamicFilters, type ActiveFilter } from "@/components/DynamicFieldFilters";
import { fetchAllPages } from "@/lib/fetchAllPages";
import AdminPagination from "@/components/admin/AdminPagination";
import CheckinRaffle from "@/components/CheckinRaffle";
import { downloadCheckinReport, type CheckinReportRow } from "@/lib/checkinReportPdf";
import { format } from "date-fns";

const PAGE_SIZE = 50;

function eachDay(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const s = new Date(startISO + "T12:00:00");
  const e = new Date(endISO + "T12:00:00");
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
function todayISO() { return new Date().toISOString().slice(0, 10); }


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

  // Event + day selectors (multi-day support)
  const [events, setEvents] = useState<Array<{ id: string; title: string; start_date: string; end_date: string; slug: string }>>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [selectedDay, setSelectedDay] = useState<string>("");

  // Checked-in list + filters
  const [checkedIn, setCheckedIn] = useState<RegistrationData[]>([]);
  const [allCheckedIn, setAllCheckedIn] = useState<RegistrationData[]>([]); // for raffle (full filtered set, not paginated)
  const [dayCheckinMap, setDayCheckinMap] = useState<Map<string, string>>(new Map()); // registration_id -> checked_at for selected day
  const [customFields, setCustomFields] = useState<EventFormField[]>(FIXED_FILTER_FIELDS);
  const [dynamicFilters, setDynamicFilters] = useState<ActiveFilter[]>([]);
  const [searchCheckedIn, setSearchCheckedIn] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [exportingReport, setExportingReport] = useState(false);

  const selectedEvent = useMemo(() => events.find(e => e.id === selectedEventId), [events, selectedEventId]);
  const eventDays = useMemo(() => selectedEvent ? eachDay(selectedEvent.start_date, selectedEvent.end_date) : [], [selectedEvent]);
  const isMultiDay = eventDays.length > 1;

  // Debounce search of checked-in list
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchCheckedIn.trim()), 300);
    return () => clearTimeout(t);
  }, [searchCheckedIn]);

  useEffect(() => { setPage(1); }, [debouncedSearch, dynamicFilters, selectedEventId, selectedDay]);

  // Load events
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("id, title, start_date, end_date, slug, status")
        .in("status", ["published", "closed", "concluded"])
        .order("start_date", { ascending: false });
      const list = (data || []) as any[];
      setEvents(list);
      if (list.length > 0 && !selectedEventId) setSelectedEventId(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default day when event changes
  useEffect(() => {
    if (!selectedEvent) { setSelectedDay(""); return; }
    const days = eachDay(selectedEvent.start_date, selectedEvent.end_date);
    const t = todayISO();
    setSelectedDay(days.includes(t) ? t : days[0]);
  }, [selectedEvent]);

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
    if (!selectedEventId || !selectedDay) {
      setCheckedIn([]); setAllCheckedIn([]); setTotalCount(0); setDayCheckinMap(new Map());
      return;
    }
    // 1) Fetch checkin_days for the selected event/day
    const dayRows = await fetchAllPages<{ registration_id: string; checked_at: string }>(() =>
      supabase
        .from("checkin_days")
        .select("registration_id, checked_at")
        .eq("event_id", selectedEventId)
        .eq("event_day", selectedDay)
        .order("checked_at", { ascending: false })
    );
    const idToCheckedAt = new Map<string, string>();
    dayRows.forEach(r => idToCheckedAt.set(r.registration_id, r.checked_at));
    setDayCheckinMap(idToCheckedAt);

    if (dayRows.length === 0) {
      setCheckedIn([]); setAllCheckedIn([]); setTotalCount(0);
      return;
    }

    // 2) Fetch registrations in batches (in() limit safe at 500)
    const ids = Array.from(idToCheckedAt.keys());
    const allRegs: RegistrationData[] = [];
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      let q = supabase.from("registrations").select("*").in("id", chunk);
      if (debouncedSearch) {
        const escaped = debouncedSearch.replace(/[%,]/g, "");
        q = q.or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,cpf.ilike.%${escaped}%`);
      }
      const { data } = await q;
      allRegs.push(...((data || []) as unknown as RegistrationData[]));
    }
    // Override checkin_at with the per-day timestamp for display/sort
    const decorated = allRegs.map(r => ({ ...r, checkin_at: idToCheckedAt.get(r.id) || r.checkin_at }));
    decorated.sort((a, b) => (b.checkin_at || "").localeCompare(a.checkin_at || ""));

    const filtered = applyDynamicFilters(decorated, dynamicFilters);
    setAllCheckedIn(filtered);
    setTotalCount(filtered.length);
    const from = (page - 1) * PAGE_SIZE;
    setCheckedIn(filtered.slice(from, from + PAGE_SIZE));
  }, [page, debouncedSearch, dynamicFilters, selectedEventId, selectedDay]);

  useEffect(() => { loadCheckedIn(); }, [loadCheckedIn]);

  /**
   * Performs the actual check-in mutation. Used by QR scan, token paste,
   * and the "Confirmar check-in" button on each search result card.
   */
  const confirmCheckin = useCallback(async (registration: RegistrationData, action: "scan" | "manual" = "manual") => {
    if (registration.payment_status !== "approved") {
      setResult({ reg: registration, status: "not_paid" });
      playBeep("error");
      toast.error("Pagamento não aprovado");
      scheduleResultClear(4000);
      return;
    }
    if (!selectedEventId || !selectedDay) {
      toast.error("Selecione um evento e o dia do check-in");
      return;
    }
    // Validate event matches
    if (registration.event_id && registration.event_id !== selectedEventId) {
      toast.error("Esta inscrição é de outro evento");
      playBeep("error");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const checkinAt = new Date().toISOString();

    // Per-day idempotent insert (UNIQUE constraint registration_id+event_day)
    const { error: dayErr } = await supabase.from("checkin_days").insert({
      registration_id: registration.id,
      event_id: selectedEventId,
      event_day: selectedDay,
      checked_at: checkinAt,
      checked_by_user_id: user?.id,
    });

    if (dayErr) {
      // 23505 = duplicate → already checked in for this day
      if ((dayErr as any).code === "23505") {
        const dayLabel = format(new Date(selectedDay + "T12:00:00"), "dd/MM");
        setResult({ reg: { ...registration, checkin_status: "checked_in" }, status: "already" });
        playBeep("warning");
        toast.warning(`Já presente em ${dayLabel}`);
        scheduleResultClear(2500);
        return;
      }
      setResult({ reg: registration, status: "error" });
      playBeep("error");
      toast.error("Erro no check-in");
      scheduleResultClear(4000);
      return;
    }

    // Best-effort: maintain legacy registrations.checkin_status as "ever attended"
    if (registration.checkin_status === "not_checked_in") {
      await supabase
        .from("registrations")
        .update({
          checkin_status: "checked_in",
          checkin_at: checkinAt,
          checkin_by_user_id: user?.id,
        })
        .eq("id", registration.id)
        .eq("checkin_status", "not_checked_in");
    }

    // Best-effort log
    await supabase.from("checkin_logs").insert({
      registration_id: registration.id,
      action_type: action,
      checked_by_user_id: user?.id,
    });

    const updated = { ...registration, checkin_status: "checked_in" as const, checkin_at: checkinAt };
    setResult({ reg: updated, status: "success" });
    playBeep("success");
    toast.success(`Check-in de ${registration.full_name} realizado!`);
    scheduleResultClear(2500);

    setSearchResults(prev => prev ? prev.map(r => r.id === registration.id ? updated : r) : prev);
    loadCheckedIn();
  }, [loadCheckedIn, selectedEventId, selectedDay]);

  const processCheckinByToken = useCallback(async (rawToken: string) => {
    const token = (rawToken || "").trim();
    if (!token) return;

    // Per-token cooldown: ignore the same QR being scanned repeatedly within 3s.
    // Also evict old entries to avoid unbounded growth in long sessions.
    const now = Date.now();
    const map = lastScannedRef.current;
    const last = map.get(token) || 0;
    if (now - last < 3000) return;
    map.set(token, now);
    if (map.size > 200) {
      for (const [k, t] of map) {
        if (now - t > 60000) map.delete(k);
      }
    }

    if (processingRef.current) return;
    processingRef.current = true;
    try {
      const { data: reg } = await supabase
        .from("registrations")
        .select("*")
        .eq("qr_token", token)
        .maybeSingle();

      if (!reg) {
        setResult({ reg: null as any, status: "not_found" });
        playBeep("error");
        toast.error("QR Code inválido");
        scheduleResultClear(4000);
        return;
      }
      await confirmCheckin(reg as unknown as RegistrationData, "scan");
    } finally {
      // Short serialization window; per-token cooldown handles repeats
      setTimeout(() => { processingRef.current = false; }, 600);
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

  async function tryStart(scanner: Html5Qrcode, constraint: any) {
    await scanner.start(
      constraint,
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => { processCheckinByToken(decodedText); },
      () => {}
    );
  }

  async function startScanner() {
    if (scannerActive || scannerStarting) return;

    // Unlock audio (iOS) on the same user gesture
    ensureAudio();

    if (!window.isSecureContext) {
      toast.error("A câmera requer HTTPS para funcionar.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Este navegador não suporta acesso à câmera.");
      return;
    }

    setScannerStarting(true);

    // Wait until React actually mounts the <div id="qr-reader"> in the DOM.
    // requestAnimationFrame alone is NOT enough (React batches state → render).
    const containerEl = await new Promise<HTMLElement | null>((resolve) => {
      let attempts = 0;
      const check = () => {
        const el = document.getElementById("qr-reader");
        if (el) { resolve(el); return; }
        if (++attempts > 30) { resolve(null); return; } // ~500ms max
        setTimeout(check, 16);
      };
      check();
    });

    if (!containerEl) {
      setScannerStarting(false);
      toast.error("Não foi possível inicializar o leitor de câmera.");
      return;
    }

    try {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      // html5-qrcode only accepts facingMode as a string ("environment"/"user")
      // or as { exact: "environment" }. Using { ideal: ... } throws a validation error.
      try {
        await tryStart(scanner, { facingMode: "environment" });
      } catch (err1: any) {
        console.warn("[checkin] environment camera failed, trying user camera", err1);
        try {
          await tryStart(scanner, { facingMode: "user" });
        } catch (err2: any) {
          console.warn("[checkin] user camera failed, trying enumerated cameras", err2);
          // Last resort: enumerate cameras and pick the first available deviceId
          const cameras = await Html5Qrcode.getCameras();
          if (!cameras || cameras.length === 0) {
            throw err2;
          }
          // Prefer a back-facing camera by label heuristic, otherwise first one
          const back = cameras.find(c => /back|rear|environment|traseira/i.test(c.label || ""));
          const chosen = back || cameras[0];
          await tryStart(scanner, { deviceId: { exact: chosen.id } });
        }
      }

      // Make the injected <video> render correctly on iOS Safari and small screens
      const video = containerEl.querySelector("video") as HTMLVideoElement | null;
      if (video) {
        video.setAttribute("playsinline", "true");
        video.muted = true;
        video.style.width = "100%";
        video.style.height = "100%";
        video.style.objectFit = "cover";
      }

      setScannerActive(true);
    } catch (err: any) {
      const name = err?.name || "";
      console.warn("[checkin] camera start failed", err);
      if (name === "NotAllowedError") {
        toast.error("Permissão de câmera negada. Habilite nas configurações do navegador.");
      } else if (name === "NotFoundError") {
        toast.error("Nenhuma câmera encontrada neste dispositivo.");
      } else if (name === "NotReadableError") {
        toast.error("Câmera em uso por outro aplicativo.");
      } else {
        toast.error("Não foi possível acessar a câmera.");
      }
      // Cleanup partially started scanner
      try { await scannerRef.current?.stop(); } catch {}
      scannerRef.current = null;
    } finally {
      setScannerStarting(false);
    }
  }

  async function stopScanner() {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      scannerRef.current = null;
    }
    setScannerActive(false);
    setScannerStarting(false);
  }

  useEffect(() => {
    return () => {
      stopScanner();
      if (resultClearTimerRef.current) {
        window.clearTimeout(resultClearTimerRef.current);
      }
      // Best-effort close audio context
      try { audioCtxRef.current?.close(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `checkedIn` is already the filtered + paginated slice from loadCheckedIn().
  const filteredCheckedIn = checkedIn;

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
              disabled={scannerStarting}
              className="gap-2"
            >
              {scannerStarting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Iniciando...</>
              ) : scannerActive ? (
                <><CameraOff className="h-4 w-4" /> Parar Câmera</>
              ) : (
                <><Camera className="h-4 w-4" /> Abrir Câmera</>
              )}
            </Button>
          </div>
          {(scannerActive || scannerStarting) && (
            <div className="relative mx-auto w-full max-w-sm aspect-square overflow-hidden rounded-lg bg-muted">
              <div id="qr-reader" className="absolute inset-0" />
              {scannerStarting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/70 backdrop-blur-sm">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Iniciando câmera...</p>
                </div>
              )}
            </div>
          )}
          {scannerActive && (
            <p className="text-center text-xs text-muted-foreground">
              Aponte a câmera para o QR Code do participante. A câmera continua ativa para o próximo.
            </p>
          )}
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
