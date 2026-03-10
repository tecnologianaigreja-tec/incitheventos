import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Download } from "lucide-react";
import type { EventData } from "@/lib/types";

export default function AdminExport() {
  const [events, setEvents] = useState<EventData[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("events").select("*").order("created_at", { ascending: false });
      setEvents((data || []) as unknown as EventData[]);
      setLoading(false);
    }
    load();
  }, []);

  async function exportCSV() {
    let query = supabase.from("registrations").select("*");
    if (selectedEvent !== "all") query = query.eq("event_id", selectedEvent);
    const { data } = await query;
    if (!data || data.length === 0) { toast.info("Nenhum dado para exportar"); return; }

    const headers = ["Nome", "E-mail", "CPF", "Telefone", "Congregação", "Cargo", "Função", "Tipo", "Status Pagamento", "Check-in", "Certificado", "Código Inscrição"];
    const rows = data.map((r: any) => [
      r.full_name, r.email, r.cpf, r.phone, r.congregation, r.church_role, r.church_function,
      r.registration_type, r.payment_status, r.checkin_status, r.certificate_status, r.registration_code,
    ]);

    const csv = [headers.join(","), ...rows.map(r => r.map((v: string) => `"${(v || "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inscritos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exportação concluída");
  }

  if (loading) return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      <h2 className="font-serif text-xl font-bold text-foreground">Exportação</h2>
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">Exportar Inscritos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Select value={selectedEvent} onValueChange={setSelectedEvent}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Filtrar por evento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os eventos</SelectItem>
                {events.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={exportCSV} className="gap-2">
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
