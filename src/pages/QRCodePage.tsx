import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { RegistrationData } from "@/lib/types";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download } from "lucide-react";

export default function QRCodePage() {
  const { registrationCode } = useParams<{ registrationCode: string }>();
  const navigate = useNavigate();
  const [reg, setReg] = useState<RegistrationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!registrationCode) return;
      const { data } = await supabase
        .from("registrations")
        .select("*")
        .eq("registration_code", registrationCode)
        .single();
      if (data) setReg(data as unknown as RegistrationData);
      setLoading(false);
    }
    load();
  }, [registrationCode]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!reg || !reg.qr_token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <h1 className="mb-2 font-serif text-2xl font-bold text-foreground">QR Code não disponível</h1>
        <p className="mb-6 text-muted-foreground">O QR Code será liberado após a confirmação do pagamento.</p>
        <Button variant="outline" onClick={() => navigate("/")}>Voltar</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-4 py-6">
        <div className="container mx-auto max-w-lg">
          <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <h1 className="font-serif text-2xl font-bold text-foreground">QR Code de Check-in</h1>
        </div>
      </div>

      <div className="container mx-auto max-w-lg px-4 py-8">
        <Card className="border-2">
          <CardContent className="flex flex-col items-center p-8 text-center">
            <p className="mb-2 font-semibold text-foreground">{reg.full_name}</p>
            <p className="mb-6 text-sm text-muted-foreground">Código: {reg.registration_code}</p>
            <div className="rounded-xl border-4 border-primary/10 bg-card p-6">
              <QRCodeSVG value={reg.qr_token} size={240} level="H" />
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              Apresente este QR Code no dia do evento para realizar o check-in.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
