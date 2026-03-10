import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCentsToBRL } from "@/lib/constants";
import { Users, DollarSign, QrCode, Award, ShoppingCart, UserCheck } from "lucide-react";

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

  if (loading) return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  const cards = [
    { label: "Total de Inscritos", value: stats.totalRegistrations, icon: Users },
    { label: "Pagos / Confirmados", value: stats.totalPaid, icon: UserCheck },
    { label: "Pendentes", value: stats.totalPending, icon: ShoppingCart },
    { label: "Individual", value: stats.totalIndividual, icon: Users },
    { label: "Em Lote", value: stats.totalBatch, icon: Users },
    { label: "Check-ins", value: stats.totalCheckedIn, icon: QrCode },
    { label: "Certificados", value: stats.totalCertificates, icon: Award },
    { label: "Faturamento", value: formatCentsToBRL(stats.totalRevenue), icon: DollarSign },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
            <c.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-serif text-2xl font-bold text-foreground">{c.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
