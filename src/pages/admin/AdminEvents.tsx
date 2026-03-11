import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { EventData } from "@/lib/types";
import { formatCentsToBRL } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit } from "lucide-react";

const statusLabels: Record<string, string> = { draft: "Rascunho", published: "Publicado", closed: "Encerrado", canceled: "Cancelado" };
const statusColors: Record<string, string> = { draft: "secondary", published: "default", closed: "outline", canceled: "destructive" };

export default function AdminEvents() {
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("events").select("*").order("created_at", { ascending: false });
      setEvents((data || []) as unknown as EventData[]);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl font-bold text-foreground">Eventos</h2>
        <Button onClick={() => navigate("/admin/eventos/novo")} className="gap-2"><Plus className="h-4 w-4" /> Novo Evento</Button>
      </div>

      <div className="space-y-4">
        {events.map(ev => (
          <Card key={ev.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/admin/eventos/${ev.id}`)}>
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <h3 className="font-semibold text-foreground">{ev.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {new Date(ev.start_date + "T00:00:00").toLocaleDateString("pt-BR")} — {formatCentsToBRL(ev.unit_price_cents)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={statusColors[ev.status] as any}>{statusLabels[ev.status]}</Badge>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); navigate(`/admin/eventos/${ev.id}`); }}>
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {events.length === 0 && <p className="text-center text-muted-foreground py-12">Nenhum evento cadastrado</p>}
      </div>
    </div>
  );
}
