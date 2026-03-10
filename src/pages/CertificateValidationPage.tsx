import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Search } from "lucide-react";

export default function CertificateValidationPage() {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const [searchCode, setSearchCode] = useState(code || searchParams.get("code") || "");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (code) validate(code);
  }, [code]);

  async function validate(certCode: string) {
    setLoading(true);
    setSearched(true);

    const { data: cert } = await supabase
      .from("certificates")
      .select("*, registrations!inner(full_name, event_id, checkin_status)")
      .eq("certificate_code", certCode.trim().toUpperCase())
      .single();

    if (cert) {
      const reg = (cert as any).registrations;
      const { data: event } = await supabase
        .from("events")
        .select("title, start_date, end_date, workload_hours")
        .eq("id", reg.event_id)
        .single();

      setResult({
        valid: true,
        name: reg.full_name,
        event_title: event?.title,
        start_date: event?.start_date,
        end_date: event?.end_date,
        workload_hours: event?.workload_hours,
        issued_at: cert.issued_at,
      });
    } else {
      setResult({ valid: false });
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-background px-4 py-16">
      <div className="container mx-auto max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="mb-2 font-serif text-3xl font-bold text-foreground">Validação de Certificado</h1>
          <p className="text-muted-foreground">Informe o código do certificado para verificar a autenticidade.</p>
        </div>

        <div className="mb-8 flex gap-2">
          <Input
            placeholder="Código do certificado"
            value={searchCode}
            onChange={(e) => setSearchCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && validate(searchCode)}
          />
          <Button onClick={() => validate(searchCode)} disabled={loading || !searchCode.trim()} className="gap-2">
            <Search className="h-4 w-4" /> Verificar
          </Button>
        </div>

        {loading && (
          <div className="flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        )}

        {searched && !loading && result && (
          <Card className="border-2">
            <CardContent className="flex flex-col items-center p-8 text-center">
              {result.valid ? (
                <>
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success text-success-foreground">
                    <CheckCircle className="h-8 w-8" />
                  </div>
                  <h2 className="mb-4 font-serif text-2xl font-bold text-foreground">Certificado Válido</h2>
                  <div className="w-full space-y-3 text-left text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Participante</span>
                      <span className="font-medium text-foreground">{result.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Evento</span>
                      <span className="font-medium text-foreground">{result.event_title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Data</span>
                      <span className="font-medium text-foreground">
                        {new Date(result.start_date + "T00:00:00").toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    {result.workload_hours && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Carga horária</span>
                        <span className="font-medium text-foreground">{result.workload_hours}h</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
                    <XCircle className="h-8 w-8" />
                  </div>
                  <h2 className="mb-2 font-serif text-2xl font-bold text-foreground">Certificado Não Encontrado</h2>
                  <p className="text-muted-foreground">O código informado não corresponde a nenhum certificado válido.</p>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
