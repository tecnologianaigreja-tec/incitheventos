import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { formatCentsToBRL } from "@/lib/constants";
import { Users, DollarSign, QrCode, Award, ShoppingCart, UserCheck, TrendingUp, ArrowUpRight } from "lucide-react";

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

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    totalRegistrations: 0, totalPaid: 0, totalPending: 0, totalBatch: 0,
    totalIndividual: 0, totalCheckedIn: 0, totalCertificates: 0, totalRevenue: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [regsRes, ordersRes, certsRes] = await Promise.all([
        supabase.from("registrations").select("registration_status, registration_type, checkin_status, payment_status"),
        supabase.from("orders").select("payment_status, total_price_cents, purchase_type"),
        supabase.from("certificates").select("id"),
      ]);

      const regs = (regsRes.data || []) as any[];
      const orders = (ordersRes.data || []) as any[];
      const certs = (certsRes.data || []) as any[];

      setStats({
        totalRegistrations: regs.length,
        totalPaid: regs.filter(r => r.registration_status === "confirmed").length,
        totalPending: regs.filter(r => r.registration_status === "pending_payment").length,
        totalBatch: regs.filter(r => r.registration_type === "batch").length,
        totalIndividual: regs.filter(r => r.registration_type === "individual").length,
        totalCheckedIn: regs.filter(r => r.checkin_status === "checked_in").length,
        totalCertificates: certs.length,
        totalRevenue: orders.filter(o => o.payment_status === "approved").reduce((s: number, o: any) => s + o.total_price_cents, 0),
      });
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" /></div>;

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
      {/* Welcome section */}
      <div className="rounded-xl gradient-dark p-6 lg:p-8 shadow-premium-lg">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-gold shadow-gold">
            <TrendingUp className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="font-serif text-2xl font-bold text-white tracking-tight">Visão Geral</h2>
            <p className="text-white/50 text-sm mt-0.5">Métricas consolidadas de todos os eventos</p>
          </div>
        </div>
      </div>

      {/* Cards grid */}
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
            {/* Subtle corner decoration */}
            <div className={`absolute -top-8 -right-8 h-16 w-16 rounded-full opacity-[0.04] ${
              c.accent ? "bg-accent" : "bg-primary"
            }`} />
          </Card>
        ))}
      </div>
    </div>
  );
}
