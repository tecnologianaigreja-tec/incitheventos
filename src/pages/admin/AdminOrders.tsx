import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { OrderData } from "@/lib/types";
import { formatCentsToBRL } from "@/lib/constants";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const statusLabels: Record<string, string> = {
  pending: "Pendente", approved: "Aprovado", refused: "Recusado",
  canceled: "Cancelado", expired: "Expirado", refunded: "Reembolsado",
};

export default function AdminOrders() {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
      setOrders((data || []) as unknown as OrderData[]);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      <h2 className="font-serif text-xl font-bold text-foreground">Pedidos</h2>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map(o => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs">{o.order_code}</TableCell>
                <TableCell>{o.buyer_name}</TableCell>
                <TableCell><Badge variant="secondary">{o.purchase_type === "individual" ? "Individual" : "Lote"}</Badge></TableCell>
                <TableCell>{o.participants_count}</TableCell>
                <TableCell>{formatCentsToBRL(o.total_price_cents)}</TableCell>
                <TableCell><Badge variant={o.payment_status === "approved" ? "default" : "secondary"}>{statusLabels[o.payment_status]}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(o.created_at).toLocaleDateString("pt-BR")}</TableCell>
              </TableRow>
            ))}
            {orders.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Nenhum pedido</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
