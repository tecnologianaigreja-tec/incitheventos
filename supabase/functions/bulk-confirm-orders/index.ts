// Admin-only: confirm multiple pending orders at once with a single reason.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.0";
import { approveOrder } from "../_shared/approveOrder.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return respond({ error: "Não autenticado" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return respond({ error: "Não autenticado" }, 401);

    const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) return respond({ error: "Acesso negado" }, 403);

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { body = {}; }

    const orderIds = Array.isArray(body.order_ids) ? (body.order_ids as unknown[]).filter((x) => typeof x === "string") as string[] : [];
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const proofRef = typeof body.proof_reference === "string" ? body.proof_reference.trim() : "";

    if (orderIds.length === 0) return respond({ error: "Selecione ao menos 1 pedido" }, 400);
    if (orderIds.length > 100) return respond({ error: "Máximo de 100 pedidos por vez" }, 400);
    if (reason.length < 5) return respond({ error: "Motivo é obrigatório (mín. 5 caracteres)" }, 400);

    const { data: orders } = await supabase
      .from("orders")
      .select("*")
      .in("id", orderIds);

    const results: Array<{ order_id: string; order_code?: string; ok: boolean; reason?: string; confirmed?: number }> = [];

    for (const order of orders || []) {
      if (order.payment_status !== "pending") {
        results.push({ order_id: order.id, order_code: order.order_code, ok: false, reason: `status=${order.payment_status}` });
        continue;
      }

      const { confirmedCount: confirmed } = await approveOrder({
        supabase,
        order,
        source: "manual_bulk",
        actorId: user.id,
        externalEventId: proofRef ? `manual_bulk:${proofRef}` : null,
        rawPayload: { source: "admin_bulk", reason, proof_reference: proofRef || null, actor_id: user.id, batch_size: orderIds.length },
        eventType: "manual_bulk_confirmation",
      });

      results.push({ order_id: order.id, order_code: order.order_code, ok: true, confirmed });
    }

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    return respond({ ok: true, total: results.length, approved: okCount, failed: failCount, results });
  } catch (err) {
    console.error("[bulk-confirm-orders] unexpected:", err);
    return respond({ error: "Erro interno" }, 500);
  }
});
