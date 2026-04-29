import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { OrderData, RegistrationData } from "@/lib/types";
import { formatCentsToBRL } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, XCircle, AlertTriangle, ArrowLeft, QrCode } from "lucide-react";

const statusConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pending: { label: "Aguardando pagamento", icon: Clock, color: "bg-warning text-warning-foreground" },
  approved: { label: "Pagamento aprovado", icon: CheckCircle, color: "bg-success text-success-foreground" },
  refused: { label: "Pagamento recusado", icon: XCircle, color: "bg-destructive text-destructive-foreground" },
  canceled: { label: "Cancelado", icon: XCircle, color: "bg-muted text-muted-foreground" },
  expired: { label: "Expirado", icon: AlertTriangle, color: "bg-muted text-muted-foreground" },
  refunded: { label: "Reembolsado", icon: AlertTriangle, color: "bg-muted text-muted-foreground" },
};

export default function OrderStatusPage() {
  const { orderCode } = useParams<{ orderCode: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    async function reconcile() {
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        await fetch(
          `https://${projectId}.supabase.co/functions/v1/reconcile-payment`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ order_code: orderCode }),
          }
        );
      } catch (err) {
        console.warn("Reconcile call failed (will retry on next poll):", err);
      }
    }

    async function load() {
      if (!orderCode) return;

      const { data: orderData } = await supabase
        .from("orders")
        .select("*")
        .eq("order_code", orderCode)
        .single();

      if (cancelled) return;

      if (orderData) {
        setOrder(orderData as unknown as OrderData);

        const { data: regs } = await supabase
          .from("registrations")
          .select("*")
          .eq("order_id", orderData.id);

        if (!cancelled && regs) setRegistrations(regs as unknown as RegistrationData[]);
      }
      setLoading(false);
    }

    async function bootstrap() {
      // First, ask the backend to verify with InfinitePay if this order
      // is already paid (covers cases when webhook was missed or delayed).
      // Only blocks the very first render.
      await reconcile();
      await load();
      // Keep polling: reconcile + reload every 8s while page is open.
      interval = setInterval(async () => {
        await reconcile();
        await load();
      }, 8000);
    }

    bootstrap();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [orderCode, searchParams]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <h1 className="mb-2 font-serif text-2xl font-bold text-foreground">Pedido não encontrado</h1>
        <p className="mb-6 text-muted-foreground">Verifique o código do pedido e tente novamente.</p>
        <Button variant="outline" onClick={() => navigate("/")}>Voltar ao início</Button>
      </div>
    );
  }

  const config = statusConfig[order.payment_status] || statusConfig.pending;
  const StatusIcon = config.icon;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-4 py-6">
        <div className="container mx-auto max-w-3xl">
          <button onClick={() => navigate("/")} className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <h1 className="font-serif text-2xl font-bold text-foreground">Status do Pedido</h1>
          <p className="mt-1 text-sm text-muted-foreground">Código: {order.order_code}</p>
        </div>
      </div>

      <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
        {/* Status Card */}
        <Card className="border-2">
          <CardContent className="flex flex-col items-center p-8 text-center">
            <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-full ${config.color}`}>
              <StatusIcon className="h-8 w-8" />
            </div>
            <h2 className="mb-2 font-serif text-2xl font-bold text-foreground">{config.label}</h2>
            {order.payment_status === "pending" && (
              <p className="text-sm text-muted-foreground">
                Seu pagamento está sendo processado. Esta página atualiza automaticamente.
              </p>
            )}
            {order.payment_status === "approved" && (
              <p className="text-sm text-muted-foreground">
                Sua inscrição foi confirmada! Veja abaixo os QR Codes para check-in.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Order Details */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">Detalhes do Pedido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Comprador</span>
              <span className="font-medium text-foreground">{order.buyer_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo</span>
              <Badge variant="secondary">{order.purchase_type === "individual" ? "Individual" : "Lote"}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Participantes</span>
              <span className="font-medium text-foreground">{order.participants_count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-serif text-lg font-bold text-foreground">{formatCentsToBRL(order.total_price_cents)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Registrations */}
        <div className="space-y-4">
          <h3 className="font-serif text-xl font-bold text-foreground">Inscrições</h3>
          {registrations.map((reg) => (
            <Card key={reg.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{reg.full_name}</p>
                    <p className="text-sm text-muted-foreground">{reg.email}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Código: {reg.registration_code}</p>
                  </div>
                  <Badge variant={reg.registration_status === "confirmed" ? "default" : "secondary"}>
                    {reg.registration_status === "confirmed" ? "Confirmado" : "Pendente"}
                  </Badge>
                </div>
                {reg.qr_token && order.payment_status === "approved" && (
                  <Button
                    variant="outline"
                    className="mt-4 gap-2"
                    onClick={() => navigate(`/inscricao/${reg.registration_code}/qrcode`)}
                  >
                    <QrCode className="h-4 w-4" /> Ver QR Code
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
