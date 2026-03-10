import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { EventData } from "@/lib/types";
import { formatCentsToBRL } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Edit } from "lucide-react";

const statusLabels: Record<string, string> = { draft: "Rascunho", published: "Publicado", closed: "Encerrado", canceled: "Cancelado" };
const statusColors: Record<string, string> = { draft: "secondary", published: "default", closed: "outline", canceled: "destructive" };

export default function AdminEvents() {
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventData | null>(null);
  const [form, setForm] = useState(getEmptyForm());

  function getEmptyForm() {
    return {
      title: "", subtitle: "", slug: "", description: "", start_date: "", end_date: "",
      start_time: "", end_time: "", location_name: "", address: "", city: "", state: "",
      workload_hours: "", organizer_name: "", unit_price_cents: "", max_participants: "",
      status: "draft" as string,
    };
  }

  async function loadEvents() {
    const { data } = await supabase.from("events").select("*").order("created_at", { ascending: false });
    setEvents((data || []) as unknown as EventData[]);
    setLoading(false);
  }

  useEffect(() => { loadEvents(); }, []);

  function openNew() {
    setEditingEvent(null);
    setForm(getEmptyForm());
    setDialogOpen(true);
  }

  function openEdit(ev: EventData) {
    setEditingEvent(ev);
    setForm({
      title: ev.title, subtitle: ev.subtitle || "", slug: ev.slug, description: ev.description || "",
      start_date: ev.start_date, end_date: ev.end_date, start_time: ev.start_time || "",
      end_time: ev.end_time || "", location_name: ev.location_name || "", address: ev.address || "",
      city: ev.city || "", state: ev.state || "", workload_hours: ev.workload_hours?.toString() || "",
      organizer_name: ev.organizer_name || "", unit_price_cents: (ev.unit_price_cents / 100).toString(),
      max_participants: ev.max_participants?.toString() || "", status: ev.status,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title || !form.slug || !form.start_date || !form.end_date) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }

    const payload = {
      title: form.title, subtitle: form.subtitle || null, slug: form.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      description: form.description || null, start_date: form.start_date, end_date: form.end_date,
      start_time: form.start_time || null, end_time: form.end_time || null,
      location_name: form.location_name || null, address: form.address || null,
      city: form.city || null, state: form.state || null,
      workload_hours: form.workload_hours ? parseFloat(form.workload_hours) : null,
      organizer_name: form.organizer_name || null,
      unit_price_cents: Math.round(parseFloat(form.unit_price_cents || "0") * 100),
      max_participants: form.max_participants ? parseInt(form.max_participants) : null,
      status: form.status as any,
    };

    if (editingEvent) {
      const { error } = await supabase.from("events").update(payload).eq("id", editingEvent.id);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Evento atualizado");
    } else {
      const { error } = await supabase.from("events").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Evento criado");
    }

    setDialogOpen(false);
    loadEvents();
  }

  if (loading) return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl font-bold text-foreground">Eventos</h2>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Novo Evento</Button>
      </div>

      <div className="space-y-4">
        {events.map(ev => (
          <Card key={ev.id}>
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <h3 className="font-semibold text-foreground">{ev.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {new Date(ev.start_date + "T00:00:00").toLocaleDateString("pt-BR")} — {formatCentsToBRL(ev.unit_price_cents)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={statusColors[ev.status] as any}>{statusLabels[ev.status]}</Badge>
                <Button variant="ghost" size="icon" onClick={() => openEdit(ev)}><Edit className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {events.length === 0 && <p className="text-center text-muted-foreground py-12">Nenhum evento cadastrado</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif">{editingEvent ? "Editar Evento" : "Novo Evento"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Título *</Label>
              <Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
            </div>
            <div className="sm:col-span-2">
              <Label>Subtítulo</Label>
              <Input value={form.subtitle} onChange={e => setForm({...form, subtitle: e.target.value})} />
            </div>
            <div>
              <Label>Slug *</Label>
              <Input value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} placeholder="conferencia-2026" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="published">Publicado</SelectItem>
                  <SelectItem value="closed">Encerrado</SelectItem>
                  <SelectItem value="canceled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Data início *</Label><Input type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} /></div>
            <div><Label>Data fim *</Label><Input type="date" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} /></div>
            <div><Label>Hora início</Label><Input type="time" value={form.start_time} onChange={e => setForm({...form, start_time: e.target.value})} /></div>
            <div><Label>Hora fim</Label><Input type="time" value={form.end_time} onChange={e => setForm({...form, end_time: e.target.value})} /></div>
            <div><Label>Local</Label><Input value={form.location_name} onChange={e => setForm({...form, location_name: e.target.value})} /></div>
            <div><Label>Endereço</Label><Input value={form.address} onChange={e => setForm({...form, address: e.target.value})} /></div>
            <div><Label>Cidade</Label><Input value={form.city} onChange={e => setForm({...form, city: e.target.value})} /></div>
            <div><Label>Estado</Label><Input value={form.state} onChange={e => setForm({...form, state: e.target.value})} /></div>
            <div><Label>Carga horária (h)</Label><Input type="number" value={form.workload_hours} onChange={e => setForm({...form, workload_hours: e.target.value})} /></div>
            <div><Label>Organizador</Label><Input value={form.organizer_name} onChange={e => setForm({...form, organizer_name: e.target.value})} /></div>
            <div><Label>Valor unitário (R$) *</Label><Input type="number" step="0.01" value={form.unit_price_cents} onChange={e => setForm({...form, unit_price_cents: e.target.value})} /></div>
            <div><Label>Máx. participantes</Label><Input type="number" value={form.max_participants} onChange={e => setForm({...form, max_participants: e.target.value})} /></div>
            <div className="sm:col-span-2">
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={4} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingEvent ? "Salvar" : "Criar"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
