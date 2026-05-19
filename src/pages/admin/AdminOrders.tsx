import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { OrderData } from "@/lib/types";
import { formatCentsToBRL } from "@/lib/constants";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, CheckCircle2, Search, ShieldCheck, FileImage, X, Check, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import AdminPagination from "@/components/admin/AdminPagination";
import { getDefaultEventId } from "@/lib/utils";

const statusLabels: Record<string, string> = {
  pending: "Pendente", approved: "Aprovado", refused: "Recusado",
  canceled: "Cancelado", expired: "Expirado", refunded: "Reembolsado",
};

interface PaymentProof {
  id: string;
  order_id: string;
  buyer_cpf: string;
  image_url: string;
  message: string | null;
  status: string;
  created_at: string;
  reviewer_note: string | null;
  reviewed_at: string | null;
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [reconcilingAll, setReconcilingAll] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Event filter
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");

  // Manual confirmation dialog (single)
  const [manualOrder, setManualOrder] = useState<OrderData | null>(null);
  const [manualReason, setManualReason] = useState("");
  const [manualProof, setManualProof] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkProof, setBulkProof] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // Cancel order
  const [cancelOrder, setCancelOrder] = useState<OrderData | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  // Proof review
  const [reviewProof, setReviewProof] = useState<PaymentProof | null>(null);
  const [reviewImageUrl, setReviewImageUrl] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const ORDERS_PAGE_SIZE = 50;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page on search/event change
  useEffect(() => { setOrdersPage(1); }, [debouncedSearch, selectedEventId]);

  // Load events list
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
    })();
  }, []);

  async function load() {
    if (!selectedEventId) { setLoading(false); return; }
    const from = (ordersPage - 1) * ORDERS_PAGE_SIZE;
    const to = from + ORDERS_PAGE_SIZE - 1;

    let ordersQuery = supabase
      .from("orders")
      .select("*", { count: "exact" })
      .eq("event_id", selectedEventId)
      .order("created_at", { ascending: false });

    if (debouncedSearch) {
      const escaped = debouncedSearch.replace(/[%,]/g, "");
      ordersQuery = ordersQuery.or(
        `order_code.ilike.%${escaped}%,buyer_name.ilike.%${escaped}%,buyer_email.ilike.%${escaped}%,buyer_document.ilike.%${escaped}%`,
      );
    }

    const [ordersRes, proofsRes] = await Promise.all([
      ordersQuery.range(from, to),
      supabase
        .from("payment_proofs")
        .select("*")
        .eq("event_id", selectedEventId)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    setOrders((ordersRes.data || []) as unknown as OrderData[]);
    setOrdersTotal(ordersRes.count || 0);
    setProofs((proofsRes.data || []) as PaymentProof[]);
    setLoading(false);
  }

  useEffect(() => { if (selectedEventId) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ordersPage, debouncedSearch, selectedEventId]);

  async function callFunction(name: string, payload: Record<string, unknown>, withAuth = false) {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    };
    if (withAuth) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    }
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/${name}`,
      { method: "POST", headers, body: JSON.stringify(payload) }
    );
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  async function reconcileOne(order: OrderData) {
    setReconcilingId(order.id);
    try {
      const { ok, data } = await callFunction("reconcile-payment", { order_id: order.id });
      if (!ok) { toast.error(data.error || "Falha ao verificar."); return; }
      if (data.approved > 0) toast.success(`Pagamento confirmado para ${order.order_code}!`);
      else toast.info(`Pagamento ainda pendente em ${order.order_code}.`);
      await load();
    } catch (err) {
      console.error(err); toast.error("Falha de conexão.");
    } finally { setReconcilingId(null); }
  }

  async function reconcileAll() {
    setReconcilingAll(true);
    try {
      const { ok, data } = await callFunction("reconcile-payment", { scan_all: true }, true);
      if (!ok) { toast.error(data.error || "Falha."); return; }
      toast.success(`Verificados ${data.checked} pedidos · ${data.approved} confirmados.`);
      await load();
    } catch (err) {
      console.error(err); toast.error("Falha de conexão.");
    } finally { setReconcilingAll(false); }
  }

  function openManualDialog(order: OrderData) {
    setManualOrder(order); setManualReason(""); setManualProof("");
  }

  async function submitManualConfirmation() {
    if (!manualOrder) return;
    if (manualReason.trim().length < 5) { toast.error("Motivo precisa ter ao menos 5 caracteres."); return; }
    setManualSubmitting(true);
    try {
      const { ok, data } = await callFunction("manual-confirm-order", {
        order_id: manualOrder.id,
        reason: manualReason.trim(),
        proof_reference: manualProof.trim() || undefined,
      }, true);
      if (!ok) { toast.error(data.error || "Falha."); return; }
      toast.success(`${manualOrder.order_code} confirmado.`);
      setManualOrder(null); await load();
    } catch (err) {
      console.error(err); toast.error("Falha de conexão.");
    } finally { setManualSubmitting(false); }
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  }

  function toggleSelectAll(pendingIds: string[]) {
    if (pendingIds.every((id) => selectedIds.has(id))) {
      const next = new Set(selectedIds);
      pendingIds.forEach((id) => next.delete(id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      pendingIds.forEach((id) => next.add(id));
      setSelectedIds(next);
    }
  }

  async function submitBulkConfirmation() {
    if (selectedIds.size === 0) return;
    if (bulkReason.trim().length < 5) { toast.error("Motivo precisa ter ao menos 5 caracteres."); return; }
    setBulkSubmitting(true);
    try {
      const { ok, data } = await callFunction("bulk-confirm-orders", {
        order_ids: Array.from(selectedIds),
        reason: bulkReason.trim(),
        proof_reference: bulkProof.trim() || undefined,
      }, true);
      if (!ok) { toast.error(data.error || "Falha."); return; }
      toast.success(`${data.approved} pedido(s) confirmado(s)${data.failed ? ` · ${data.failed} falhou` : ""}.`);
      setBulkOpen(false); setSelectedIds(new Set()); setBulkReason(""); setBulkProof("");
      await load();
    } catch (err) {
      console.error(err); toast.error("Falha de conexão.");
    } finally { setBulkSubmitting(false); }
  }

  function openCancelDialog(order: OrderData) {
    setCancelOrder(order);
    setCancelReason("");
  }

  async function submitCancelOrder() {
    if (!cancelOrder) return;
    if (cancelReason.trim().length < 5) { toast.error("Motivo precisa ter ao menos 5 caracteres."); return; }
    setCancelSubmitting(true);
    try {
      const { ok, data } = await callFunction("cancel-order", {
        order_id: cancelOrder.id,
        reason: cancelReason.trim(),
      }, true);
      if (!ok) { toast.error(data.error || "Falha ao cancelar."); return; }
      toast.success(`Pedido ${cancelOrder.order_code} cancelado.`);
      setCancelOrder(null); await load();
    } catch (err) {
      console.error(err); toast.error("Falha de conexão.");
    } finally { setCancelSubmitting(false); }
  }

  async function openReview(proof: PaymentProof) {
    setReviewProof(proof);
    setReviewNote("");
    setReviewImageUrl(null);
    // Generate signed URL to view the image
    const { data } = await supabase.storage
      .from("payment-proofs")
      .createSignedUrl(proof.image_url, 60 * 10);
    setReviewImageUrl(data?.signedUrl || null);
  }

  async function reviewAction(action: "approve" | "reject") {
    if (!reviewProof) return;
    if (action === "reject" && reviewNote.trim().length < 3) {
      toast.error("Informe o motivo da rejeição."); return;
    }
    setReviewSubmitting(true);
    try {
      const { ok, data } = await callFunction("review-payment-proof", {
        proof_id: reviewProof.id,
        action,
        note: reviewNote.trim() || undefined,
      }, true);
      if (!ok) { toast.error(data.error || "Falha."); return; }
      toast.success(action === "approve" ? "Pagamento aprovado!" : "Comprovante rejeitado.");
      setReviewProof(null); await load();
    } catch (err) {
      console.error(err); toast.error("Falha de conexão.");
    } finally { setReviewSubmitting(false); }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  // Search is applied server-side via .or() in load()
  const filteredOrders = orders;
  const q = debouncedSearch;

  const pendingFilteredIds = filteredOrders.filter(o => o.payment_status === "pending").map(o => o.id);
  const allPendingSelected = pendingFilteredIds.length > 0 && pendingFilteredIds.every(id => selectedIds.has(id));

  const pendingProofs = proofs.filter(p => p.status === "pending");
  const reviewedProofs = proofs.filter(p => p.status !== "pending");

  const orderByProofId = (orderId: string) => orders.find(o => o.id === orderId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="font-serif text-xl font-bold text-foreground">Pedidos</h2>
          <p className="text-sm text-muted-foreground">
            Verifique pendentes automaticamente, confirme manualmente ou aprove comprovantes enviados pelos clientes.
          </p>
        </div>
        <div className="w-full sm:w-72 space-y-1">
          <Label>Evento</Label>
          <Select value={selectedEventId || undefined} onValueChange={setSelectedEventId}>
            <SelectTrigger><SelectValue placeholder="Selecione um evento" /></SelectTrigger>
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

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Pedidos</TabsTrigger>
          <TabsTrigger value="proofs" className="gap-2">
            Comprovantes
            {pendingProofs.length > 0 && (
              <Badge variant="default" className="h-5 px-1.5 text-xs">{pendingProofs.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4 pt-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por nome, código ou e-mail..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              {selectedIds.size > 0 && (
                <Button onClick={() => setBulkOpen(true)} className="gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  Confirmar {selectedIds.size} selecionado(s)
                </Button>
              )}
              <Button variant="outline" onClick={reconcileAll} disabled={reconcilingAll} className="gap-2">
                {reconcilingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Verificar todos pendentes
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allPendingSelected}
                      onCheckedChange={() => toggleSelectAll(pendingFilteredIds)}
                      disabled={pendingFilteredIds.length === 0}
                      aria-label="Selecionar todos pendentes"
                    />
                  </TableHead>
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
                {filteredOrders.map(o => {
                  const isPending = o.payment_status === "pending";
                  const hasProof = pendingProofs.some(p => p.order_id === o.id);
                  return (
                    <TableRow key={o.id} className={selectedIds.has(o.id) ? "bg-muted/40" : undefined}>
                      <TableCell>
                        {isPending && (
                          <Checkbox
                            checked={selectedIds.has(o.id)}
                            onCheckedChange={() => toggleSelect(o.id)}
                            aria-label={`Selecionar ${o.order_code}`}
                          />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {o.order_code}
                        {hasProof && (
                          <Badge variant="outline" className="ml-2 gap-1 text-[10px]">
                            <FileImage className="h-3 w-3" /> comprovante
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{o.buyer_name}</TableCell>
                      <TableCell><Badge variant="secondary">{o.purchase_type === "individual" ? "Individual" : "Lote"}</Badge></TableCell>
                      <TableCell>{o.participants_count}</TableCell>
                      <TableCell>{formatCentsToBRL(o.total_price_cents)}</TableCell>
                      <TableCell>
                        <Badge variant={o.payment_status === "approved" ? "default" : "secondary"}>
                          {statusLabels[o.payment_status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {isPending && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => reconcileOne(o)} disabled={reconcilingId === o.id} className="gap-1">
                                {reconcilingId === o.id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <CheckCircle2 className="h-3 w-3" />}
                                Verificar
                              </Button>
                              <Button size="sm" variant="default" onClick={() => openManualDialog(o)} className="gap-1">
                                <ShieldCheck className="h-3 w-3" /> Confirmar
                              </Button>
                            </>
                          )}
                          {o.payment_status !== "canceled" && o.payment_status !== "refunded" && (
                            <Button size="sm" variant="destructive" onClick={() => openCancelDialog(o)} className="gap-1">
                              <XCircle className="h-3 w-3" /> Cancelar
                            </Button>
                          )}
                          {o.payment_status === "canceled" && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredOrders.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">{q ? "Nenhum pedido encontrado" : "Nenhum pedido"}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <AdminPagination
            page={ordersPage}
            pageSize={ORDERS_PAGE_SIZE}
            total={ordersTotal}
            onPageChange={setOrdersPage}
          />
        </TabsContent>

        <TabsContent value="proofs" className="space-y-4 pt-4">
          <div>
            <h3 className="font-medium text-foreground">Aguardando análise ({pendingProofs.length})</h3>
            <p className="text-sm text-muted-foreground">Comprovantes enviados pelos clientes que pagaram via PIX direto.</p>
          </div>
          {pendingProofs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nenhum comprovante aguardando análise.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {pendingProofs.map(p => {
                const order = orderByProofId(p.order_id);
                return (
                  <div key={p.id} className="rounded-lg border border-border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{order?.order_code || p.order_id.slice(0, 8)}</p>
                        <p className="text-sm text-muted-foreground">{order?.buyer_name} · {order ? formatCentsToBRL(order.total_price_cents) : ""}</p>
                      </div>
                      <Badge variant="secondary">{new Date(p.created_at).toLocaleDateString("pt-BR")}</Badge>
                    </div>
                    {p.message && (
                      <p className="text-sm bg-muted/50 rounded p-2 italic">"{p.message}"</p>
                    )}
                    <Button size="sm" onClick={() => openReview(p)} className="w-full gap-2">
                      <FileImage className="h-4 w-4" /> Ver comprovante
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {reviewedProofs.length > 0 && (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                Histórico ({reviewedProofs.length})
              </summary>
              <div className="mt-3 space-y-2">
                {reviewedProofs.slice(0, 30).map(p => {
                  const order = orderByProofId(p.order_id);
                  return (
                    <div key={p.id} className="flex items-center justify-between rounded border border-border p-2 text-sm">
                      <span>{order?.order_code || p.order_id.slice(0, 8)} · {order?.buyer_name}</span>
                      <Badge variant={p.status === "approved" ? "default" : "destructive"}>{p.status}</Badge>
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </TabsContent>
      </Tabs>

      {/* Single manual confirmation */}
      <Dialog open={!!manualOrder} onOpenChange={(o) => !o && setManualOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar pagamento manualmente</DialogTitle>
            <DialogDescription>
              Use somente quando tiver comprovante externo (PIX, transferência) e o webhook não tiver chegado.
              {manualOrder && (
                <span className="mt-2 block text-foreground">
                  <strong>{manualOrder.order_code}</strong> · {manualOrder.buyer_name} · {formatCentsToBRL(manualOrder.total_price_cents)}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="manual-reason">Motivo *</Label>
              <Textarea id="manual-reason" placeholder="Ex: Comprovante PIX recebido por WhatsApp em 29/04/2026" value={manualReason} onChange={(e) => setManualReason(e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-proof">Referência (opcional)</Label>
              <Input id="manual-proof" placeholder="ID transação, autenticação ou ID PIX" value={manualProof} onChange={(e) => setManualProof(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOrder(null)} disabled={manualSubmitting}>Cancelar</Button>
            <Button onClick={submitManualConfirmation} disabled={manualSubmitting}>
              {manualSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk confirmation */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar {selectedIds.size} pedido(s) em massa</DialogTitle>
            <DialogDescription>
              O motivo informado será registrado em auditoria para todos os pedidos selecionados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bulk-reason">Motivo *</Label>
              <Textarea id="bulk-reason" placeholder="Ex: Conciliação manual de PIX recebidos em 29/04/2026" value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-proof">Referência (opcional)</Label>
              <Input id="bulk-proof" placeholder="Ex: extrato 29/04, lote 001" value={bulkProof} onChange={(e) => setBulkProof(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkSubmitting}>Cancelar</Button>
            <Button onClick={submitBulkConfirmation} disabled={bulkSubmitting}>
              {bulkSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirmar todos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Proof review */}
      <Dialog open={!!reviewProof} onOpenChange={(o) => !o && setReviewProof(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Análise de comprovante</DialogTitle>
            <DialogDescription>
              {reviewProof && (() => {
                const o = orderByProofId(reviewProof.order_id);
                return o ? (
                  <span className="text-foreground">
                    <strong>{o.order_code}</strong> · {o.buyer_name} · {formatCentsToBRL(o.total_price_cents)}
                  </span>
                ) : "Pedido não encontrado";
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {reviewProof?.message && (
              <div className="rounded bg-muted/50 p-3 text-sm italic">"{reviewProof.message}"</div>
            )}
            {reviewImageUrl ? (
              <a href={reviewImageUrl} target="_blank" rel="noopener noreferrer">
                <img src={reviewImageUrl} alt="Comprovante" className="max-h-96 w-full object-contain rounded border border-border bg-muted" />
              </a>
            ) : (
              <div className="flex items-center justify-center h-40 rounded border border-dashed">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="review-note">Observação (obrigatória se rejeitar)</Label>
              <Textarea id="review-note" placeholder="Ex: valor não confere com o pedido" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => reviewAction("reject")} disabled={reviewSubmitting} className="gap-2">
              <X className="h-4 w-4" /> Rejeitar
            </Button>
            <Button onClick={() => reviewAction("approve")} disabled={reviewSubmitting} className="gap-2">
              {reviewSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Aprovar e confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel order */}
      <Dialog open={!!cancelOrder} onOpenChange={(o) => !o && setCancelOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar pedido</DialogTitle>
            <DialogDescription>
              Esta ação cancela o pedido e marca todas as inscrições vinculadas como canceladas.
              O participante precisará realizar uma nova inscrição para o evento.
              {cancelOrder && (
                <span className="mt-2 block text-foreground">
                  <strong>{cancelOrder.order_code}</strong> · {cancelOrder.buyer_name} · {formatCentsToBRL(cancelOrder.total_price_cents)}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Motivo do cancelamento *</Label>
              <Textarea
                id="cancel-reason"
                placeholder="Ex: Solicitação do participante via WhatsApp"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOrder(null)} disabled={cancelSubmitting}>Voltar</Button>
            <Button variant="destructive" onClick={submitCancelOrder} disabled={cancelSubmitting}>
              {cancelSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Cancelar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
