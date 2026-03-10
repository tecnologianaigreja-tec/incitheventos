import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RegistrationData } from "@/lib/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Award, Download } from "lucide-react";

export default function AdminCertificates() {
  const [registrations, setRegistrations] = useState<RegistrationData[]>([]);
  const [certificates, setCertificates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [regsRes, certsRes] = await Promise.all([
      supabase.from("registrations").select("*").eq("payment_status", "approved").eq("checkin_status", "checked_in"),
      supabase.from("certificates").select("*"),
    ]);
    setRegistrations((regsRes.data || []) as unknown as RegistrationData[]);
    setCertificates(certsRes.data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function issueCertificate(reg: RegistrationData) {
    // Check event is closed
    const { data: event } = await supabase.from("events").select("status").eq("id", reg.event_id).single();
    if (!event || event.status !== "closed") {
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
    load();
  }

  async function issueAll() {
    const eligible = registrations.filter(r => !certificates.find(c => c.registration_id === r.id));
    if (eligible.length === 0) { toast.info("Todos os certificados elegíveis já foram emitidos"); return; }

    for (const reg of eligible) {
      await issueCertificate(reg);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl font-bold text-foreground">Certificados</h2>
        <Button onClick={issueAll} className="gap-2"><Award className="h-4 w-4" /> Emitir Todos Elegíveis</Button>
      </div>

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
                    {!cert && (
                      <Button variant="ghost" size="sm" onClick={() => issueCertificate(r)} className="gap-1">
                        <Award className="h-3 w-3" /> Emitir
                      </Button>
                    )}
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
    </div>
  );
}
