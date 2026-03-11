import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RegistrationData } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Camera, Search, CheckCircle, XCircle, AlertTriangle, CameraOff } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

export default function AdminCheckin() {
  const [scannerActive, setScannerActive] = useState(false);
  const [manualSearch, setManualSearch] = useState("");
  const [result, setResult] = useState<{ reg: RegistrationData; status: "success" | "already" | "error" | "not_found" | "not_paid" } | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);

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
        toast.warning("Check-in já realizado");
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

      setResult({ reg: { ...registration, checkin_status: "checked_in" }, status: "success" });
      toast.success(`Check-in de ${registration.full_name} realizado!`);
    } finally {
      setTimeout(() => { processingRef.current = false; }, 2000);
    }
  }, []);

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
    setResult({ reg: registration, status: registration.checkin_status === "checked_in" ? "already" : "success" });

    if (registration.checkin_status !== "checked_in" && registration.payment_status === "approved") {
      await processCheckin(registration.qr_token || "");
    }
  }

  async function startScanner() {
    try {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          processCheckin(decodedText);
        },
        () => {} // ignore scan failures
      );
      setScannerActive(true);
    } catch {
      toast.error("Não foi possível acessar a câmera");
    }
  }

  async function stopScanner() {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {}
      scannerRef.current = null;
    }
    setScannerActive(false);
  }

  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="font-serif text-xl font-bold text-foreground">Check-in</h2>

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
          <div
            id="qr-reader"
            className={`mx-auto overflow-hidden rounded-lg ${scannerActive ? "w-full max-w-sm" : "hidden"}`}
          />
          {scannerActive && (
            <p className="text-center text-xs text-muted-foreground">Aponte a câmera para o QR Code do participante</p>
          )}
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
          <div className="flex gap-2">
            <Input
              placeholder="Cole o token do QR Code aqui"
              onKeyDown={async (e) => {
                if (e.key === "Enter") {
                  await processCheckin((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = "";
                }
              }}
              className="flex-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Result */}
      {result && result.reg && (
        <Card className={`border-2 ${
          result.status === "success" ? "border-success" :
          result.status === "already" ? "border-warning" :
          "border-destructive"
        }`}>
          <CardContent className="flex items-center gap-6 p-8">
            <div className={`flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full ${
              result.status === "success" ? "bg-success text-success-foreground" :
              result.status === "already" ? "bg-warning text-warning-foreground" :
              "bg-destructive text-destructive-foreground"
            }`}>
              {result.status === "success" ? <CheckCircle className="h-10 w-10" /> :
               result.status === "already" ? <AlertTriangle className="h-10 w-10" /> :
               <XCircle className="h-10 w-10" />}
            </div>
            <div>
              <h3 className="text-2xl font-bold text-foreground">{result.reg.full_name}</h3>
              <p className="text-muted-foreground">{result.reg.congregation}</p>
              <div className="mt-2 flex gap-2">
                <Badge variant={result.reg.payment_status === "approved" ? "default" : "destructive"}>
                  {result.reg.payment_status === "approved" ? "Pago" : "Não pago"}
                </Badge>
                <Badge variant={result.reg.checkin_status === "checked_in" ? "default" : "secondary"}>
                  {result.reg.checkin_status === "checked_in" ? "Check-in ✓" : "Sem check-in"}
                </Badge>
              </div>
              {result.status === "success" && (
                <p className="mt-2 text-sm font-semibold text-success">Check-in realizado com sucesso!</p>
              )}
              {result.status === "already" && (
                <p className="mt-2 text-sm font-semibold text-warning">Check-in já havia sido realizado anteriormente.</p>
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
    </div>
  );
}
