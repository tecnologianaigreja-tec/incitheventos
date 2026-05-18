import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { formatCentsToBRL } from "@/lib/constants";
import { getDefaultEventId } from "@/lib/utils";
import { Users, DollarSign, QrCode, Award, ShoppingCart, UserCheck, TrendingUp } from "lucide-react";

interface Stats {
  totalRegistrations: number;
  totalPaid: number;
  totalPending: number;
  totalBatch: number;
  totalIndividual: number;
  totalCheckedIn: number;
  totalCertificates: number;
  totalRevenue: number;
}

const EMPTY: Stats = {
  totalRegistrations: 0, totalPaid: 0, totalPending: 0, totalBatch: 0,
  totalIndividual: 0, totalCheckedIn: 0, totalCertificates: 0, totalRevenue: 0,
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("id, title, status, start_date, created_at")
        .order("created_at", { ascending: false });
      const list = data || [];
      setEvents(list);
      const def = getDefaultEventId(list);
      if (def) setSelectedEventId(def);
      else setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedEventId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [regsRes, ordersRes] = await Promise.all([
        supabase.from("registrations")
          .select("id, registration_status, registration_type, checkin_status, payment_status")
          .eq("event_id", selectedEventId),
        supabase.from("orders")
          .select("payment_status, total_price_cents, purchase_type")
          .eq("event_id", selectedEventId),
      ]);

      const regs = (regsRes.data || []) as any[];
      const orders = (ordersRes.data || []) as any[];

      // Certificates: single RPC call instead of N+1 chunked queries
      const { data: certCount } = await (supabase as any).rpc("count_certificates_for_event", {
        _event_id: selectedEventId,
      });
      const totalCertificates = Number(certCount) || 0;

      if (cancelled) return;
      setStats({
        totalRegistrations: regs.length,
        totalPaid: regs.filter(r => r.registration_status === "confirmed").length,
        totalPending: regs.filter(r => r.registration_status === "pending_payment").length,
        totalBatch: regs.filter(r => r.registration_type === "batch").length,
        totalIndividual: regs.filter(r => r.registration_type === "individual").length,
        totalCheckedIn: regs.filter(r => r.checkin_status === "checked_in").length,
        totalCertificates,
        totalRevenue: orders.filter(o => o.payment_status === "approved").reduce((s: number, o: any) => s + o.total_price_cents, 0),
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedEventId]);

  const cards = [
    { label: "Total de Inscritos", value: stats.totalRegistrations, icon: Users, accent: false },
    { label: "Pagos / Confirmados", value: stats.totalPaid, icon: UserCheck, accent: false },
    { label: "Pendentes", value: stats.totalPending, icon: ShoppingCart, accent: false },
    { label: "Individual", value: stats.totalIndividual, icon: Users, accent: false },
    { label: "Em Lote", value: stats.totalBatch, icon: Users, accent: false },
    { label: "Check-ins", value: stats.totalCheckedIn, icon: QrCode, accent: false },
    { label: "Certificados", value: stats.totalCertificates, icon: Award, accent: false },
    { label: "Faturamento", value: formatCentsToBRL(stats.totalRevenue), icon: DollarSign, accent: true },
  ];

  return (
    <div className="space-y-8">
      <div className="rounded-xl gradient-dark p-6 lg:p-8 shadow-premium-lg">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-gold shadow-gold">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="font-serif text-2xl font-bold text-white tracking-tight">Visão Geral</h2>
              <p className="text-white/50 text-sm mt-0.5">Métricas do evento selecionado</p>
            </div>
          </div>
          <div className="w-full lg:w-72 space-y-1">
            <Label className="text-white/70 text-xs">Evento</Label>
            <Select value={selectedEventId || undefined} onValueChange={setSelectedEventId}>
              <SelectTrigger className="bg-white/10 border-white/20 text-white">
                <SelectValue placeholder="Selecione um evento" />
              </SelectTrigger>
              <SelectContent>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.title} {e.status === "published" ? "• Publicado" : e.status === "closed" ? "• Encerrado" : e.status === "concluded" ? "• Concluído" : "• Rascunho"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" /></div>
      ) : !selectedEventId ? (
        <div className="text-center py-12 text-muted-foreground">Nenhum evento disponível.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <Card
              key={c.label}
              className={`group relative overflow-hidden border transition-all duration-300 hover:shadow-premium-lg ${
                c.accent
                  ? "border-accent/20 bg-gradient-to-br from-card to-accent/[0.03]"
                  : "border-border/60 bg-card hover:border-border"
              }`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <p className="text-[13px] font-medium text-muted-foreground leading-tight">{c.label}</p>
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-300 ${
                    c.accent
                      ? "gradient-gold shadow-gold text-white"
                      : "bg-muted/70 text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground"
                  }`}>
                    <c.icon className="h-4 w-4" />
                  </div>
                </div>
                <p className={`font-serif text-3xl font-bold tracking-tight ${
                  c.accent ? "text-gradient-gold" : "text-foreground"
                }`}>
                  {c.value}
                </p>
              </CardContent>
              <div className={`absolute -top-8 -right-8 h-16 w-16 rounded-full opacity-[0.04] ${
                c.accent ? "bg-accent" : "bg-primary"
              }`} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
