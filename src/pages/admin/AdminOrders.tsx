import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { OrderData } from "@/lib/types";
import { formatCentsToBRL } from "@/lib/constants";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, CheckCircle2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const statusLabels: Record<string, string> = {
  pending: "Pendente", approved: "Aprovado", refused: "Recusado",
  canceled: "Cancelado", expired: "Expirado", refunded: "Reembolsado",
};

export default function AdminOrders() {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [reconcilingAll, setReconcilingAll] = useState(false);
  const [search, setSearch] = useState("");

  async function load() {
    const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    setOrders((data || []) as unknown as OrderData[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function reconcileOne(order: OrderData) {
    setReconcilingId(order.id);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/reconcile-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ order_id: order.id }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Falha ao verificar.");
        return;
      }
      if (data.approved > 0) {
        toast.success(`Pagamento confirmado para ${order.order_code}!`);
      } else {
        toast.info(`Pagamento ainda pendente em ${order.order_code}.`);
      }
      await load();
    } catch (err) {
      console.error("Erro ao reconciliar:", err);
      toast.error("Falha de conexão.");
    } finally {
      setReconcilingId(null);
    }
  }

  async function reconcileAll() {
    setReconcilingAll(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/reconcile-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ scan_all: true }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Falha ao verificar pendentes.");
        return;
      }
      toast.success(`Verificados ${data.checked} pedidos · ${data.approved} confirmados.`);
      await load();
    } catch (err) {
      console.error("Erro ao reconciliar tudo:", err);
      toast.error("Falha de conexão.");
    } finally {
      setReconcilingAll(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  const q = search.trim().toLowerCase();
  const filteredOrders = q
    ? orders.filter(o =>
        (o.buyer_name || "").toLowerCase().includes(q) ||
        (o.order_code || "").toLowerCase().includes(q) ||
        (o.buyer_email || "").toLowerCase().includes(q)
      )
    : orders;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-serif text-xl font-bold text-foreground">Pedidos</h2>
          <p className="text-sm text-muted-foreground">
            Pedidos pendentes podem ser verificados manualmente caso o webhook tenha falhado.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={reconcileAll}
          disabled={reconcilingAll}
          className="gap-2"
        >
          {reconcilingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Verificar todos pendentes
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar por nome, código ou e-mail..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Comprador</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Qtd</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrders.map(o => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs">{o.order_code}</TableCell>
                <TableCell>{o.buyer_name}</TableCell>
                <TableCell><Badge variant="secondary">{o.purchase_type === "individual" ? "Individual" : "Lote"}</Badge></TableCell>
                <TableCell>{o.participants_count}</TableCell>
                <TableCell>{formatCentsToBRL(o.total_price_cents)}</TableCell>
                <TableCell><Badge variant={o.payment_status === "approved" ? "default" : "secondary"}>{statusLabels[o.payment_status]}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(o.created_at).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell className="text-right">
                  {o.payment_status === "pending" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => reconcileOne(o)}
                      disabled={reconcilingId === o.id}
                      className="gap-1"
                    >
                      {reconcilingId === o.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      Verificar
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filteredOrders.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">{q ? "Nenhum pedido encontrado" : "Nenhum pedido"}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
